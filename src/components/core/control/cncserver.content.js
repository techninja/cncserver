/**
 * @file Abstraction for high level project content management.
 */
const { Raster, PointText } = require('paper');
const request = require('request');
const DataURI = require('datauri');

// Exposed export to be attached as cncserver.content
const content = {
  id: 'content',
  items: new Map(),
  limits: {
    fileSize: 9 * 1024 * 1024, // TODO: Get this into settings somewhere.
    mimetypes: {
      svg: ['image/svg+xml'],
      path: ['text/plain'],
      paper: ['application/json'],
      raster: ['image/bmp', 'image/gif', 'image/png', 'image/jpeg'],
      text: ['text/plain'],
    },
    // Extensions from mimetype.
    extensions: {
      'image/svg+xml': 'svg',
      'application/json': 'json',
      'text/plain': 'txt',
      'image/bmp': 'bmp',
      'image/gif': 'gif',
      'image/png': 'png',
      'image/jpeg': 'jpg',
    },
  },
};

module.exports = (cncserver) => {
  const { utils, projects } = cncserver;
  const { limits } = content;

  /**
   * Validates a source object to contain the correctly formatted string.
   * Converts raster binary URL input to data URI as needed.
   *
   * @param {object} source
   *   "Content" schema validated source object from request.
   *
   * @returns {Promise}
   *   Resolves with source object with content key populated with string,
   *   rejects error object detailing problem.
   */
  function normalizeContentSource(source) {
    return new Promise((resolve, reject) => {
      // First, sanity check that we have anything to work with.
      if (!source.url && !source.content) {
        reject(new Error('Request failed: Must include either source content or url'));
      } else if (source.url && !source.content) {
        // Validate URL via HEADer request first, don't download if we don't have to.
        request({ url: source.url, method: 'HEAD' }, (error, res) => {
          const mimetype = res.headers['content-type'];

          // How'd the request go?
          if (error) {
            // Escape on error.
            reject(error);
          } else if (res.statusCode < 200 || res.statusCode > 202) {
            // Escape if the server says something bad happened.
            reject(
              new Error(`Request failed: Server returned status code ${res.statusCode}`)
            );
          } else if (res.headers['content-length'] > limits.fileSize) {
            // Escape if the file is too big.
            reject(
              new Error(
                utils.singleLineString`Request failed: Requested file size
                (${res.headers['content-length']} bytes) is greater than maximum
                allowed (${limits.fileSize} bytes)`
              )
            );
          } else if (!limits.mimetypes[source.type].includes(mimetype)) {
            reject(
              new Error(
                utils.singleLineString`Content type for URL is
                '${mimetype}', must be one of
                [${limits.mimetypes[source.type].join(', ')}]
                for type: ${source.type}`
              )
            );

            // We should be good! Actually go get the file.
          } else if (source.type === 'raster') {
            // Binary source content needs to be converted to data URI.
            // TODO: Handling this like this means a LOT of memory usage for larger files,
            // should move to buffer/stream based handling.
            request.get({ url: source.url, encoding: null }, (getErr, getRes, body) => {
              if (getErr) {
                reject(getErr);
              } else {
                const datauri = new DataURI();
                datauri.format(limits.extensions[mimetype], body);
                resolve({
                  ...source,
                  mimetype,
                  content: datauri.content,
                });
              }
            });
          } else {
            // UTF-8/ASCII text content can just be grabbed directly.
            request.get({ url: source.url }, (getErr, getRes, body) => {
              if (getErr) {
                reject(getErr);
              } else {
                resolve({
                  ...source,
                  content: body,
                  mimetype: limits.mimetypes[source.type][0],
                });
              }
            });
          }
        });
      } else {
        // We already have the content, resolve the full source object.
        // TODO: Validate that raster input handed here is actually a data URI
        // as the error for adding bad data here isn't helpful.
        resolve({ ...source, mimetype: limits.mimetypes[source.type][0] });
      }
    });
  }

  /**
   * Normalize incoming content between allowed types given intent.
   * Imports content to "import" layer in prep for adding to project.
   *
   * @param {object} payload
   *  The content schema validated object from request to be imported.
   *
   * @return {Promise}
   *  Promise that returns on success the imported & normalized input, or error
   *  on failure.
   */
  content.normalizeInput = payload => new Promise((success, err) => {
    const { drawing: { base: { layers } } } = cncserver;
    const settings = projects.getFullSettings(payload.settings);

    // Validate the incoming request for correct project destination.
    if (!payload.project) {
      // Default to current.
      payload.project = projects.getCurrentHash();
    } else if (!projects.items.get(payload.project)) {
      err(new Error(
        utils.singleLineString`Project identified by '${payload.project}' does
        not exist. Verify you have the correct project, or create a new one
        before adding content.`
      ));
      return;
    }

    // Get the data from the URL or the content.
    normalizeContentSource(payload.source).then((source) => {
      // Draw to empty import layer.
      layers.import.activate();
      layers.import.removeChildren();

      let item = null;

      // What kind of input content is this?
      // Options: svg, path, paper, raster, text
      switch (source.type) {
        // Full SVG XML content
        case 'svg':
          try {
            item = layers.import.importSVG(source.content.trim(), {
              expandShapes: true,
              applyMatrix: true,
            });

            if (!item || !item.children) {
              err(new Error(
                utils.singleLineString`Failed to import SVG, please validate
                source content and try again.`
              ));
            } else {
              success({ ...payload, source, item });
            }
          } catch (error) {
            // Likely couldn't parse SVG.
            err(error);
          }
          break;

        case 'path':
          try {
            item = cncserver.drawing.base.normalizeCompoundPath(source.content);

            // Apply all path item defaults directly.
            // TODO: streamline this a bit more?
            if (settings.fill.render) item.fillColor = settings.path.fillColor;
            if (settings.stroke.render) item.strokeColor = settings.path.strokeColor;

            // Does this come from somewhere else??
            // item.closed = settings.path.closed;

            // If we don't have a path at this point we failed to import anything.
            if (!item || !item.length) {
              throw new Error('Invalid path source, verify input content and try again.');
            }

            layers.import.addChild(item);
            success({ ...payload, source, item });
          } catch (error) {
            // Likely not a valid path string.
            err(error);
          }
          break;

        case 'paper':
          try {
            item = layers.import.importJSON(source.content);
            success({ ...payload, source, item });
          } catch (error) {
            // Likely couldn't parse JSON.
            err(error);
          }
          break;

        case 'raster':
          // Content should be a Data URI at this point.
          try {
            item = new Raster(source.content);
            item.onError = (error) => {
              err(new Error(`Problem loading raster: ${error}`));
            };
            item.onLoad = () => {
              success({ ...payload, source, item });
            };
          } catch (imageErr) {
            // Couldn't load image.
            err(imageErr);
          }
          break;

        case 'text':
          item = new PointText({
            point: cncserver.drawing.base.validateBounds(payload.bounds),
            content: source.content,
          });
          success({ ...payload, source, item });
          break;

        default:
          break;
      }
      // ^^^ All promise resolves exist in the type specific logic above ^^^
    }).catch(err);
  });

  // TODO: Get all items in current project.
  content.getItems = () => {
    const items = [];
    content.items.forEach(({
      hash, title, bounds,
    }) => {
      items.push({
        hash, title, bounds,
      });
    });
    return items;
  };

  // Assume schema has been checked by the time we get here.
  content.addItem = payload => new Promise((resolve, reject) => {
    // TODO: We have content! We need to add it to the requested project.
    // - Generate a non-incremental hash for the content string
    // - Write a file with the contents to the project folder: [hash].[extension]
    // - Add functionality for project to retrieve content data to write to its
    // store and JSON.
    // - Build the content object and return.

    projects.saveContentFile(payload.source, payload.project).then((filePath) => {
      // Build the final content item.
      const item = { ...payload };
      item.source.content = filePath;
      const hash = utils.getHash(item);
      item.hash = hash;

      item.item = cncserver.drawing.stage.import(payload.item, hash, item.bounds);
      content.items.set(hash, item);

      const responseItem = content.getResponseItem(hash);
      projects.saveContentData(responseItem, payload.project);
      resolve(responseItem);
    }).catch(reject);
  });

  // Format a content item from an internal item into a response item.
  content.getResponseItem = (hash) => {
    const item = content.items.get(hash);
    const fullItem = cncserver.schemas.getDataDefault('content', item);
    return {
      project: item.project,
      hash: item.hash,
      autoRender: fullItem.autoRender,
      title: fullItem.title,
      bounds: fullItem.bounds, // TODO: Format as object
      source: {
        type: item.source.type,
        originalUrl: item.source.url || '',
        content: item.source.content,
      },
      settings: item.settings || {},
    };
  };

  // Take in a validated merged item object and compare against the change item
  // to see how to make edits.
  content.editItem = ({ hash }, deltaItem, mergedItem) => new Promise((resolve, reject) => {
    // Changing content? Run through normalizer.
    if (deltaItem.source) {
      content.normalizeInput(mergedItem).then((finalItem) => {
        projects.saveContentFile(finalItem.source, finalItem.project).then((filePath) => {
          // Build the final content item.
          const item = { ...finalItem };
          item.source.content = filePath;
          item.hash = hash;

          item.item = cncserver.drawing.stage.import(finalItem.item, hash, item.bounds);
          content.items.set(hash, item);

          const responseItem = content.getResponseItem(hash);
          projects.saveContentData(responseItem, mergedItem.project);
          resolve(responseItem);

          // Trigger autorender after resolve.
          if (responseItem.autoRender) {
            projects.setRenderingState(true, hash);
          }
        }).catch(reject);
      }).catch(reject);
    } else {
      // Otherwise, just assume the deep merged object is good and update stage.
      const item = content.items.get(hash);
      const fullChangedItem = utils.merge(item, deltaItem);
      content.items.set(hash, fullChangedItem);
      cncserver.drawing.stage.updateItem(fullChangedItem);

      // TODO: Apply path specific defaults that change stage item (color, fill render, etc);
      const responseItem = content.getResponseItem(hash);
      projects.saveContentData(responseItem, mergedItem.project);
      resolve(responseItem);

      // Trigger autorender after resolve.
      if (responseItem.autoRender) {
        projects.setRenderingState(true, hash);
      }
    }
  });


  // Pull a piece of content in fully from a file and config.
  content.loadFromFile = (fileItem, data) => {
    const fileName = fileItem.source.content;
    const filePath = projects.getContentFilePath(fileName, fileItem.project);

    // Prepare a copy of the item to be validated.
    const item = { ...fileItem };
    item.source.content = data;

    content.normalizeInput(item).then((finalItem) => {
      // Build the final content item.
      item.source.content = fileName;

      item.item = cncserver.drawing.stage.import(finalItem.item, item.hash, item.bounds);
      content.items.set(item.hash, item);
    }).catch((err) => {
      console.error(err);
      throw new Error(`Error loading content for file ${filePath}`);
    });
  };

  // Fully remove a piece of content from a project.
  content.removeItem = (hash) => {
    const { project } = content.items.get(hash);
    cncserver.drawing.stage.remove(hash);
    content.items.delete(hash);
    projects.removeContentData(hash, project);
    cncserver.sockets.sendPaperUpdate('stage');
    // TODO: Delete file, update project.
  };

  // Render a single content item (that may or may not contain other paths).
  // Assume a fully validated content item with delta settings.
  content.renderContentItem = ({
    hash, title, item, source, bounds, settings: rawSettings, project,
  }) => new Promise((resolve, reject) => {
    const {
      drawing: {
        fill, trace, vectorize, text, preview,
      },
    } = cncserver;
    const settings = projects.getFullSettings(rawSettings);
    const promiseQueue = [];

    console.log(`Rendering ${title} - ${hash}...`);
    preview.remove(hash, true);


    switch (source.type) {
      // Full Item Group (svg or paper)
      case 'paper':
      case 'svg':
        // Break it down into parts and render those single items.
        promiseQueue.push(content.renderGroup(item, hash, settings));
        break;

      case 'path':
        // Single item render.
        // console.log(settings);
        if (settings.fill.render) {
          promiseQueue.push(fill(item, hash, bounds, settings.fill));
        }
        if (settings.stroke.render) {
          promiseQueue.push(trace(item, hash, bounds, settings.stroke));
        }
        break;

      case 'raster':
        // Rasterization render (single item only)
        // Full settings are passed here as fills and stroke can be generated.
        if (settings.vectorize.render) {
          const imagePath = projects.getContentFilePath(source.content, project);
          promiseQueue.push(vectorize(imagePath, hash, bounds, settings));
        }
        break;

      case 'text':
        // Text render to bounds, etc.
        // Full settings are passed here as fills can be sub-rendered on system fonts.
        if (settings.text.render) {
          promiseQueue.push(text.draw(item.content, hash, bounds, settings));
        }
        break;

      default:
        break;
    }

    Promise.all(promiseQueue).then(resolve).catch(reject);
  });

  // Do everything needed to render a group of path items (no rasters or text).
  content.renderGroup = (group, hash, settings, skipOcclusion = false) => new Promise((resolve, reject) => {
    const {
      fill, trace, occlusion, temp,
    } = cncserver.drawing;
    const { ungroupAllGroups, cleanupInput } = cncserver.drawing.base;
    const promiseQueue = [];

    // Render Stroke for all subitems.
    if (settings.stroke.render) {
      const tempGroup = temp.addItem(group, `${hash}-stroke`);
      ungroupAllGroups(tempGroup);
      cleanupInput(tempGroup, settings);

      if (settings.stroke.cutoutOcclusion && !skipOcclusion) {
        occlusion('stroke', tempGroup);
      }

      // TODO: Only run stroke here if one is needed.
      tempGroup.children.forEach((path) => {
        promiseQueue.push(trace(path, hash, null, settings.stroke));
      });
    }


    // Render Fill for all subitems.
    if (settings.fill.render) {
      const tempGroupFill = temp.addItem(group, `${hash}-fill`);
      ungroupAllGroups(tempGroupFill);
      cleanupInput(tempGroupFill, settings);

      if (settings.fill.cutoutOcclusion && !skipOcclusion) {
        occlusion('fill', tempGroupFill);
      }

      tempGroupFill.children.forEach((path, index) => {
        if (path.hasFill()) {
          promiseQueue.push(fill(path, hash, null, settings.fill, index));
        }
      });
    }

    Promise.all(promiseQueue).then(resolve).catch(reject);
  });

  return content;
};
