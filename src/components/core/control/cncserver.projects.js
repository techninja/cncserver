/**
 * @file Abstraction for high level project management, execution.
 */
const fs = require('fs');
const path = require('path');
const DataURI = require('datauri');
const dataUriToBuffer = require('data-uri-to-buffer');
const { homedir } = require('os');

const PROJECT_JSON = 'cncserver.project.json';
const PREVIEW_SVG = 'cncserver.project.preview.svg';

// Exposed export to be attached as cncserver.projects
const projects = {
  items: new Map(),
  id: 'projects',
  homeDir: '',
  current: '',
  rendering: false,
  printing: false,
};

const getDirectories = source => fs.readdirSync(source, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

function getProjectDirName({ name, hash }) {
  return path.resolve(projects.homeDir, `${name}-${hash}`);
}

// Load all projects by file from given paths.
function loadProjects() {
  projects.items.clear();

  const dirs = getDirectories(projects.homeDir);
  dirs.forEach((dir) => {
    const jsonPath = path.resolve(projects.homeDir, dir, PROJECT_JSON);
    if (fs.existsSync(jsonPath)) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const item = require(jsonPath);
      projects.items.set(item.hash, {
        ...item,
        dir: path.resolve(projects.homeDir, dir),
      });
    }
  });
}

// Initialize with a "current" project.
function initProject() {
  const now = new Date();
  // Create a temp project or load last.
  // TODO: When deleting an open project, default to this.
  projects.addItem({
    title: 'New Project',
    description: `Automatic project created ${now.toLocaleDateString()}`,
    open: true,
  });
}

module.exports = (cncserver) => {
  const { utils } = cncserver;

  // TODO: Implement project paging.
  projects.getItems = () => {
    const items = [];
    projects.items.forEach(({
      modified, hash, title, description, name, ...project
    }) => {
      items.push({
        hash,
        title,
        description,
        modified,
        name,
        preview: projects.getRelativePreview(project),
      });
    });
    return items;
  };

  // Get the relative preview SVG path from a project object.
  projects.getRelativePreview = (project) => {
    const absPath = path.resolve(project.dir, PREVIEW_SVG);
    const cncserverHome = path.resolve(homedir(), 'cncserver');
    return fs.existsSync(absPath) ? absPath.replace(cncserverHome, '/home') : null;
  };

  projects.getCurrentHash = () => projects.current;

  // Customize the stored object to be more appropriate for responses.
  projects.getResponseItem = (hash) => {
    const project = { ...projects.items.get(hash) };
    delete project.dir;
    return project;
  };

  // Assume schema has been checked by the time we get here.
  // TODO: add support for adding content on creation.
  // TODO: When does creating a project not set it as current?
  projects.addItem = ({
    title, description = '', name, open,
  }) => {
    const cDate = new Date();

    // Compute the entire new object.
    const item = {
      cncserverProject: 'v3',
      hash: utils.getHash({ title, description, name }, 'date'),
      title,
      description,
      name: utils.getMachineName(name || title, 15),
      created: cDate.toISOString(),
      modified: cDate.toISOString(),
      content: {},
    };
    item.dir = getProjectDirName(item);

    projects.items.set(item.hash, item);

    // If we're opening by default.
    if (open) {
      projects.open(item.hash);
    }

    return projects.getResponseItem(item.hash);
  };

  // Convert a relative file path and project hash into a full file path.
  projects.getContentFilePath = (name, projectHash) => {
    const project = projects.items.get(projectHash);
    return path.resolve(project.dir, name);
  };

  // Actually save the files out for a project.
  projects.saveProjectFiles = (hash = projects.current) => {
    const item = projects.items.get(hash);
    item.modified = new Date().toISOString();
    projects.items.set(hash, item);

    const dir = utils.getDir(getProjectDirName(item));

    // Make an ammended version of item for saving, don't store some keys.
    const saveItem = { ...item };
    delete saveItem.dir;

    // Save the preview.
    fs.writeFileSync(path.resolve(dir, PREVIEW_SVG), cncserver.drawing.stage.getPreviewSVG());

    // Write the final settings file.
    fs.writeFileSync(path.resolve(dir, PROJECT_JSON), JSON.stringify(saveItem, null, 2));
  };

  // Load a project from a file. Assume hash is validated.
  projects.open = (hash) => {
    const { content } = cncserver;
    const project = projects.items.get(hash);
    projects.current = hash;

    content.items.clear();
    cncserver.drawing.stage.clearAll();
    cncserver.drawing.preview.clearAll();

    // Get all the info loaded into the content items, and get the file data.
    Object.entries(project.content).forEach(([, item]) => {
      const filePath = projects.getContentFilePath(item.source.content, hash);
      let data = '';

      // TODO: What if a file isn't there?
      if (item.source.type === 'raster') {
        const datauri = new DataURI(filePath);
        data = datauri.content;
      } else {
        data = fs.readFileSync(filePath).toString();
      }

      content.loadFromFile(item, data);
    });

    return projects.getResponseItem(hash);
  };

  // Add (or update) a content instance entry for a project.
  // Assume project hash validation.
  projects.saveContentData = (item, projectHash) => {
    const project = projects.items.get(projectHash);
    if (!project.content) project.content = {};
    project.content[item.hash] = item;
    projects.items.set(projectHash, project);
    projects.saveProjectFiles(projectHash);
  };

  // Remove the data for a piece of content.
  projects.removeContentData = (contentHash, projectHash) => {
    const project = projects.items.get(projectHash);
    delete project.content[contentHash];
    projects.items.set(projectHash, project);
    projects.saveProjectFiles(projectHash);
  };

  // Save content to a file/project.
  projects.saveContentFile = (source, projectHash) => new Promise((resolve, reject) => {
    const ext = cncserver.content.limits.extensions[source.mimetype];
    const fileName = `${utils.getHash(source.content, null)}.${ext}`;

    // If this is the first time content is being added to a project, we need to
    // create the destination dir first and save all the parts.
    const project = projects.items.get(projectHash);
    if (!fs.existsSync(project.dir)) {
      projects.saveProjectFiles(projectHash);
    }

    // Use a buffer for Data URI raster, or a string for the rest.
    const data = source.type === 'raster'
      ? dataUriToBuffer(source.content)
      : source.content;

    // TODO: Don't bother writing the file if it's the same.
    // EDGECASE: file bytes don't match and it needs a rewrite.
    fs.writeFile(projects.getContentFilePath(fileName, projectHash), data, (err) => {
      if (err) { reject(err); } else { resolve(fileName); }
    });
  });

  // Get a fully filled out merged settings object including project overrides.
  projects.getFullSettings = (settings, projectHash = projects.current) => {
    if (projectHash) {
      const project = projects.items.get(projectHash);
      return cncserver.schemas.getDataDefault(
        'settings',
        utils.merge(project.settings || {}, settings)
      );
    }

    return cncserver.schemas.getDataDefault('settings', utils.merge(settings));
  };

  // The only thing we actually allow editing of here is the Title, name and desc.
  projects.editItem = ({ hash }, { name, title, description, settings }) => new Promise((resolve, reject) => {
    let changes = false;
    const project = projects.items.get(hash);

    // Change name (must rename folder).
    if (name) {
      changes = true;
      const newName = utils.getMachineName(name || title, 15);

      // Name change? Rename the dest folder.
      if (newName !== project.name) {
        const oldPath = getProjectDirName({ hash: project.hash, name: project.name });
        const newPath = getProjectDirName({ hash: project.hash, name: newName });

        // If the old dir exists, rename it.
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }

        project.dir = newPath;
      }

      project.name = newName;
    }

    // Change title
    if (title) {
      changes = true;
      project.title = title;
    }

    // Change Description.
    if (description) {
      changes = true;
      project.description = description;
    }

    // Change Settings.
    if (settings) {
      changes = true;
      project.settings = utils.merge(project.settings, settings);
    }

    if (changes) {
      projects.items.set(hash, project);
      projects.saveProjectFiles(hash);
      resolve(projects.getResponseItem(hash));
    } else {
      reject(new Error('Edits to existing projects can only change title, name, description, or settings.'));
    }
  });

  // Remove a project.
  projects.removeItem = hash => new Promise((resolve, reject) => {
    // TODO: When deleting an open project, default to this.
    const project = projects.items.get(hash);
    const trashDir = path.resolve(utils.getUserDir('trash'), `project-${project.name}-${hash}`);
    fs.rename(project.dir, trashDir, (err) => {
      if (err) {
        reject(err);
      } else {
        projects.items.delete(hash);
        resolve();
      }
    });
  });

  // Wait till after Paper.js and schemas are loaded and get home folder, load projects.
  cncserver.binder.bindTo('schemas.loaded', projects.id, () => {
    projects.homeDir = cncserver.utils.getUserDir('projects');
    loadProjects();
    initProject();
  });

  // Rendering and print state management.
  projects.getPrintingState = () => projects.printing;
  projects.getRenderingState = () => projects.rendering;

  projects.setRenderingState = (newState, specificHash = null) => {
    if (projects.rendering === newState) return;

    if (newState) {
      projects.renderCurrentContent(specificHash).then(() => {
        // TODO: Send async stream update for render completion.
        // ...and render start?
        projects.rendering = false;

        // Clear out the temp layer to free memory.
        // TODO: Move this to a binder event?
        cncserver.drawing.temp.clearAll();
      });
    } else {
      // TODO: Stop the render...somehow?
    }
    projects.rendering = newState;
  };

  projects.setPrintingState = (newState) => {
    if (projects.printing === newState) return;

    if (newState) {
      // TODO:
      console.log('Start printing!');
      cncserver.control.renderPathsToMoves();
    } else {
      // TODO:
      console.log('Stop printing!');
    }
    projects.printing = newState;
  };

  // Render all loaded items to preview, or just one.
  projects.renderCurrentContent = (specificHash) => {
    // Clear out the preview.
    if (specificHash) {
      cncserver.drawing.preview.remove(specificHash, true);
    } else {
      cncserver.drawing.preview.clearAll(specificHash);
    }

    const renderPromises = [];
    if (specificHash) {
      const item = cncserver.content.items.get(specificHash);
      renderPromises.push(cncserver.content.renderContentItem(item));
    } else {
      cncserver.content.items.forEach((item) => {
        renderPromises.push(cncserver.content.renderContentItem(item));
      });
    }

    return Promise.all(renderPromises);
  };


  return projects;
};
