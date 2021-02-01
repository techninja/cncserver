/**
 * @file Abstraction for high level project management, execution.
 */
import fs from 'fs';
import path from 'path';
import DataURI from 'datauri';
import dataUriToBuffer from 'data-uri-to-buffer';
import { homedir } from 'os';
import * as utils from 'cs/utils';
import { getDataDefault } from 'cs/schemas';
import { colors, stage, preview, temp } from 'cs/drawing';
import { bindTo, trigger } from 'cs/binder';
import { renderPathsToMoves } from 'cs/control';
import * as content from 'cs/content';

const PROJECT_JSON = 'cncserver.project.json';
const PREVIEW_SVG = 'cncserver.project.preview.svg';

// Exposed export to be attached as cncserver.projects
export const state = {
  homeDir: '',
  current: '',
  rendering: false,
  printing: false,
};

export const items = new Map();

// Fit a "simple" or complete object into the full schema object shape.
export const fitShape = data => getDataDefault('projects', data);

const getDirectories = source => fs.readdirSync(source, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

function getProjectDirName({ name, hash }) {
  return path.resolve(state.homeDir, `${name}-${hash}`);
}

// Load all projects by file from given paths.
function loadProjects() {
  items.clear();

  const dirs = getDirectories(state.homeDir);
  dirs.forEach(dir => {
    const jsonPath = path.resolve(state.homeDir, dir, PROJECT_JSON);
    if (fs.existsSync(jsonPath)) {
      const item = fitShape(utils.getJSONFile(jsonPath));
      items.set(item.hash, {
        ...item,
        dir: path.resolve(state.homeDir, dir),
      });
    }
  });
}

// Load a project from a file. Assume hash is validated.
export function openProject(hash) {
  const project = items.get(hash);
  state.current = hash;

  content.items.clear();
  stage.clearAll();
  preview.clearAll();

  // Apply the colorset preset in the project, if we can.
  if (project.colorset) {
    colors.applyPreset(project.colorset).catch(e => {
      console.error(e);
    });
  }

  // Get all the info loaded into the content items, and get the file data.
  Object.entries(project.content).forEach(([, item]) => {
    const filePath = getContentFilePath(item.source.content, hash);
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

  trigger('projects.update', project);

  return getResponseItem(hash);
}

// Initialize with a "current" project.
function initProject() {
  const now = new Date();
  // Create a temp project or load last.
  // TODO: When deleting an open project, default to this.
  addItem({
    title: 'New Project',
    description: `Automatic project created ${now.toLocaleDateString()}`,
    open: true,
    colorset: 'default',
  });
}

// Get the relative preview SVG path from a project object.
export function getRelativePreview(project) {
  const absPath = path.resolve(project.dir, PREVIEW_SVG);
  const cncserverHome = path.resolve(homedir(), 'cncserver');
  return fs.existsSync(absPath) ? absPath.replace(cncserverHome, '/home') : null;
}

// TODO: Implement project paging.
export function getItems() {
  const newItems = [];
  items.forEach(({
    modified, hash, title, description, name, ...project
  }) => {
    newItems.push({
      hash,
      title,
      description,
      modified,
      name,
      preview: getRelativePreview(project),
    });
  });
  return newItems;
}

export const getCurrentHash = () => state.current;

// Customize the stored object to be more appropriate for responses.
export function getResponseItem(hash) {
  const project = { ...items.get(hash) };
  delete project.dir;
  return project;
}

// Assume schema has been checked by the time we get here.
// TODO: add support for adding content on creation.
// TODO: When does creating a project not set it as current?
export function addItem({
  title, description = '', name, open, options = {}
}) {
  const cDate = new Date();

  const optionsWithDefaults = fitShape({
    title,
    description,
    name: utils.getMachineName(name || title, 15),
    open,
    colorset: colors.set.name,
    options,
  });

  // Compute the entire new object.
  const item = {
    cncserverProject: 'v3',
    hash: utils.getHash({ title, description, name }, 'date'),
    created: cDate.toISOString(),
    modified: cDate.toISOString(),
    ...optionsWithDefaults,
    content: {},
  };
  item.dir = getProjectDirName(item);

  items.set(item.hash, item);

  // If we're opening by default.
  if (open) {
    openProject(item.hash);
  }

  return getResponseItem(item.hash);
}

// Convert a relative file path and project hash into a full file path.
export function getContentFilePath(name, projectHash) {
  const project = items.get(projectHash);
  return path.resolve(project.dir, name);
}

// Set the colorset for a project.
// Currently only happens when a colorset preset is loaded.
export function setColorset(colorset, hash = state.current) {
  const item = items.get(hash);
  if (item.colorset !== colorset) {
    item.colorset = colorset;
    saveProjectFiles(hash);
  }
}

// Actually save the files out for a project.
export function saveProjectFiles(hash = state.current) {
  const item = items.get(hash);
  item.modified = new Date().toISOString();
  items.set(hash, item);

  const dir = utils.getDir(getProjectDirName(item));

  // Make an ammended version of item for saving, don't store some keys.
  const saveItem = { ...item };
  delete saveItem.dir;

  // Save the preview.
  fs.writeFileSync(path.resolve(dir, PREVIEW_SVG), stage.getPreviewSVG());

  // Write the final settings file.
  fs.writeFileSync(path.resolve(dir, PROJECT_JSON), JSON.stringify(saveItem, null, 2));
}

// Add (or update) a content instance entry for a project.
// Assume project hash validation.
export function saveContentData(item, projectHash) {
  const project = items.get(projectHash);
  if (!project.content) project.content = {};
  project.content[item.hash] = item;
  items.set(projectHash, project);
  saveProjectFiles(projectHash);
}

// Remove the data for a piece of content.
export function removeContentData(contentHash, projectHash) {
  const project = items.get(projectHash);
  delete project.content[contentHash];
  items.set(projectHash, project);
  saveProjectFiles(projectHash);
}

// Save content to a file/project.
export function saveContentFile(source, projectHash) {
  return new Promise((resolve, reject) => {
    const ext = content.limits.extensions[source.mimetype];
    const fileName = `${utils.getHash(source.content, null)}.${ext}`;

    // If this is the first time content is being added to a project, we need to
    // create the destination dir first and save all the parts.
    const project = items.get(projectHash);
    if (!fs.existsSync(project.dir)) {
      saveProjectFiles(projectHash);
    }

    // Use a buffer for Data URI raster, or a string for the rest.
    const data = source.type === 'raster'
      ? dataUriToBuffer(source.content)
      : source.content;

    // TODO: Don't bother writing the file if it's the same.
    // EDGECASE: file bytes don't match and it needs a rewrite.
    fs.writeFile(getContentFilePath(fileName, projectHash), data, err => {
      if (err) { reject(err); } else { resolve(fileName); }
    });
  });
}

// Get a copy of the raw internal item for the current project.
export const getCurrent = () => ({ ...items.get(state.current) });

// Get a fully filled out merged settings object including project overrides.
export function getFullSettings(settings, projectHash = state.current) {
  if (projectHash) {
    const project = items.get(projectHash);
    return getDataDefault(
      'settings',
      utils.merge(project.settings || {}, settings)
    );
  }

  return getDataDefault('settings', utils.merge(settings));
}

// The only thing we actually allow editing of here is the Title, name and desc.
export function editItem({ hash }, {
  name, title, description, settings,
}) {
  return new Promise((resolve, reject) => {
    let changes = false;
    const project = items.get(hash);

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
      items.set(hash, project);
      saveProjectFiles(hash);
      resolve(getResponseItem(hash));
    } else {
      reject(new Error(utils.singleLineString`Edits to existing projects can only
        change title, name, description, or settings.`));
    }
  });
}

// Remove a project.
export const removeItem = hash => new Promise((resolve, reject) => {
  // TODO: When deleting an open project, default to this.
  const project = items.get(hash);
  const trashDir = path.resolve(
    utils.getUserDir('trash'), `project-${project.name}-${hash}`
  );
  fs.rename(project.dir, trashDir, err => {
    if (err) {
      reject(err);
    } else {
      items.delete(hash);
      resolve();
    }
  });
});

// Wait till after Paper.js and schemas are loaded and get home folder, load projects.
bindTo('schemas.loaded', 'projects', () => {
  state.homeDir = utils.getUserDir('projects');
  loadProjects();
  initProject();

  // Load last. DEBUG
  setTimeout(() => {
    openProject('6a1253d8aaefb233');
  }, 1);
});

// Rendering and print state management.
export const getPrintingState = () => state.printing;
export const getRenderingState = () => state.rendering;

export function setRenderingState(newState, specificHash = null) {
  if (state.rendering === newState) return;

  if (newState) {
    renderCurrentContent(specificHash).then(() => {
      // TODO: Send async stream update for render completion.
      // ...and render start?
      state.rendering = false;

      // Clear out the temp layer to free memory.
      // TODO: Move this to a binder event?
      temp.clearAll();
    });
  } else {
    // TODO: Stop the render...somehow?
  }
  state.rendering = newState;
}

export function setPrintingState(newState) {
  if (state.printing === newState) return;

  if (newState) {
    // TODO:
    console.log('Start printing!');
    renderPathsToMoves();
  } else {
    // TODO:
    console.log('Stop printing!');
  }
  state.printing = newState;
}

// Render all loaded items to preview, or just one.
export function renderCurrentContent(specificHash) {
  // Clear out the preview.
  if (specificHash) {
    preview.remove(specificHash, true);
  } else {
    preview.clearAll(specificHash);
  }

  const renderPromises = [];
  if (specificHash) {
    const item = content.items.get(specificHash);
    renderPromises.push(content.renderContentItem(item));
  } else {
    content.items.forEach(item => {
      renderPromises.push(content.renderContentItem(item));
    });
  }

  return Promise.all(renderPromises);
}
