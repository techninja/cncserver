/**
 * @file Holds all CNC Server API controller functions and RESTful interactions
 * abstracted for use in the client side application. Includable as DOM JS, or
 * as a Node module.
 *
 * In use, must set the "server" object like the following:
 *
 * cncserver.api.server = {
 *   domain: 'localhost',
 *   port: 4242,
 *   protocol: 'http',
 *   version: '1'
 * }
 */
/* eslint-env browser, node */
/* globals $ */

// Initialize wrapper object is this library is being used elsewhere
const cncserver = window.cncserver || {};

// Detect NodeJS vs Browser:
let isNode = false;
try {
  const op = Object.prototype;
  isNode = op.toString.call(global.process) === '[object process]';
} catch (e) { }


// If being used as a node module, make adjustments and provide exports.
if (isNode) {
  const request = require('request');

  // As a node module, just pass your cncserver object, and the api.server obj.
  module.exports = (cncmain, server) => {
    cncmain.api = cncserver.api;
    cncmain.api.server = server;
    cncserver.global = cncmain;
  };
}

// Define central request setup.
function _request(method, path, options) {
  const { server: srv } = cncserver.api.server;
  if (!srv) {
    console.error('CNC Server API client domain configuration not ready. Set cncserver.api.server correctly!');
    return;
  }

  let srvPath = '';

  // If given an absolute server path, use it directly
  if (path[0] === '/') {
    srvPath = path;
  } else { // Otherwise, construct an absolute path from versioned API path
    srvPath = `/v${srv.version}/${path}`;
  }

  const uri = `${srv.protocol}://${srv.domain}:${srv.port}${srv.path}`;

  // If we're batching commands.. we don't actually send them, we store them!
  // ...unless this command is meant to skipBuffer.
  if (cncserver.api.batch.skipSend && !options.data.skipBuffer) {
    if (isNode) {
      process.nextTick(() => {
        cncserver.api.batch.addEntry(`${method} ${srvPath}`, options.data);
        options.success();
      });
    } else {
      setTimeout(() => {
        cncserver.api.batch.addEntry(`${method} ${srvPath}`, options.data);
        options.success();
      }, 0);
    }
    return;
  }

  // Send the request.
  if (!isNode) {
    $.ajax({
      url: uri,
      type: method,
      data: options.data,
      success: options.success,
      error: options.error,
      timeout: options.error,
    });
  } else {
    request({
      uri,
      json: true,
      method,
      body: options.data,
      timeout: options.timeout || 1000,
    }, (error, response, body) => {
      if (error) {
        console.error('API: Node request error', uri, method, error);
        if (options.error) options.error(error, response, body);
      } else {
        if (options.success) options.success(body, response);
      }
    });
  }
}

// Define request base wrappers.
function _get(path, options) {
  _request('GET', path, options);
}
function _post(path, options) {
  _request('POST', path, options);
}
function _put(path, options) {
  _request('PUT', path, options);
}
function _delete(path, options) {
  _request('DELETE', path, options);
}

/**
 * Restful API wrappers
 */
cncserver.api = {
  pen: {
    /**
     * Get pen stat without doing anything else. Directly sets state.
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    stat: (callback) => {
      _get('pen', {
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Set pen position height
     * @param {float|string} value
     *   0 to 1 float, and named constants
     * @param {function} callback
     *   Function to callback when done, including data from response body
     * @param {object} options
         Options object with key overrides.
     */
    height: (value, callback, options = {}) => {
      options.state = value;

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put('pen', {
        data: options,
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    // Shortcut call to the above with flop set to true
    up: (callback, options) => {
      this.height(0, callback, options);
    },

    // Shortcut call to the above with flop set to true
    down: (callback, options) => {
      this.height(1, callback, options);
    },

    /**
     * Set power of the pen
     * @param {float|string} value
     *   0 to 1 float
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    power: (value, callback) => {
      _put('pen', {
        data: { power: value },
        success: (d) => {
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Reset server state for distanceCounter
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    resetCounter: (callback) => {
      _put('pen', {
        data: { resetCounter: 1 },
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Move pen to parking position outside drawing canvas
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    park: (callback, options = {}) => {
      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _delete('pen', {
        data: options,
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (!isNode) $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
    * Reset the server state of the pen position to 0,0, parking position
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    zero: (callback) => {
      _put('motors', {
        data: { reset: 1 },
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Set pen to absolute x/y point within defined cncserver canvas width/height
     * @param {object} point
     *   {x,y} point object of coordinate within 0-100% of canvas to move to
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    move: (point, callback) => {
      if (typeof point === 'undefined') {
        if (callback) callback(false);
        return;
      }

      if (!isNode) $(cncserver.api).trigger('movePoint', [point]);

      let { x, y, ignoreTimeout = callback ? '' : '1' } = point;

      // Sanity check inputs
      x = x < 0 ? 0 : x;
      y = y < 0 ? 0 : y;

      if (!point.abs) {
        x = x > 100 ? 100 : x;
        y = y > 100 ? 100 : y;
      }


      _put('pen', {
        data: { x, y, ignoreTimeout, ...point },
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        },
      });
    }
  },

  motors: {
    /**
     * Disable motors, allow them to be turned by hand
     * @param {function} callback
     *   Function to callback when done, including data from response body
     * @param {object} options
     *   Object of key:value sets to pass to the API request.
     */
    unlock: (callback, options) => {
      _delete('motors', {
        data: options,
        success: callback,
        error: (e) => {
          callback(false, e);
        }
      });
    }
  },

  tools: {
    /**
     * List the available tools for the current bot type
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    list: (callback) => {
      _get('tools', {
        success: callback,
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Change to a given tool
     * @param {string} toolName
     *   Machine name of tool to switch to
     * @param {function} callback
     *   Function to callback when done, including data from response body
     * @param {function} options
     *   The base of the full object to send for API options
     */
    change: (toolName, callback, options = {}) => {
      if (!isNode) $(cncserver.api).trigger('offCanvas');
      if (!isNode) $(cncserver.api).trigger('toolChange');

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put(`tools/${toolName}`, {
        success: callback,
        data: options,
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    }
  },

  buffer: {
    /**
     * Pause all bot operations until resumed
     */
    pause: (callback) => {
      _put('buffer', {
        data: { paused: true },
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('paused');
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    },

    /**
     * Pause all bot operations until resumed
     */
    resume: (callback) => {
      _put('buffer', {
        data: { paused: false },
        success: (d) => {
          if (!isNode) $(cncserver.api).trigger('resumed');
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        },
      });
    },

    /**
     * Push a message into the buffer
     */
    message: (message, callback) => {
      _post('buffer', {
        data: { message },
        success: (d) => {
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        },
      });
    },

    /**
     * Push a callback name into the buffer
     */
    callbackname: (name, callback) => {
      _post('buffer', {
        data: { callback: name },
        success: (d) => {
          if (callback) callback(d);
        },
        error: (e) => {
          if (callback) callback(false, e);
        },
      });
    },

    /**
     * Pause all bot operations until resumed
     */
    clear: (callback) => {
      _delete('buffer', {
        success: callback,
        error: (e) => {
          if (callback) callback(false, e);
        }
      });
    }
  },

  settings: {
    /**
     * Get the cncserver global settings object
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    global: (callback) => {
      _get('settings/global', {
        success: callback,
        error: (e) => {
          callback(false, e);
        },
      });
    },

    /**
     * Get the cncserver bot specific settings object
     * @param {function} callback
     *   Function to callback when done, including data from response body
     */
    bot: (callback) => {
      _get('settings/bot', {
        success: callback,
        error: (e) => {
          callback(false, e);
        }
      });
    },
  },

  // Scratch turtle/abstracted API, non-ReSTful.
  scratch: {
    move: (direction, amount, callback) => {
      _get(`/move.${direction}./${amount}`,
        {
          success: () => {
            _get('/poll', {
              success: (d) => {
                // Callback return objectified /poll data
                const data = d.split('\n');
                const out = {};
                for (var i in data) {
                  var line = data[i].split(' ');
                  out[line[0]] = line[1];
                }
                callback(out);
              },
            });
          }
        }
      );
    }
  },

  // Batch API for lowering command send overhead.
  batch: {
    skipSend: false,
    saveFile: '',
    firstCommand: true,
    data: [],

    /**
     * Once enabled, all commands sent through this wrapper will be saved for
     * batch sending instead of actually being sent, until end is run.
     *
     * @return {[type]} [description]
     */
    start: (options = {}) => {
      cncserver.api.batch.endClear();
      cncserver.api.batch.skipSend = true;

      // If node and a file path send, try to save it
      // TODO: Add in some file access checks to keep this from dying.
      if (isNode && options.saveToFile) {
        cncserver.api.batch.fs = require('fs');
        cncserver.api.batch.saveFile = options.saveToFile;
        cncserver.api.batch.fs.writeFileSync(options.saveToFile, '[');
      }
    },

    /**
     * Write final file ending to the JSON file storage.
     */
    finishFile: () => {
      if (cncserver.api.batch.saveFile) {
        cncserver.api.batch.fs.appendFileSync(
          cncserver.api.batch.saveFile,
          ']'
        );
      }
    },

    /**
     * Add an entry into the batch data storage.
     *
     * @param {string} key
     *   The key holding the method and path
     * @param {object} data
     *   The data arguments being sent to modify the command.
     */
    addEntry: (key, data) => {
      // Unset ignore timeout as it's just dead weight with batch.
      if (data.ignoreTimeout) delete data.ignoreTimeout;

      const entry = {};
      entry[key] = data;

      // Store the data.
      if (cncserver.api.batch.saveFile) {
        let line = JSON.stringify(entry);

        // Add a comma if the command isn't first.
        if (!cncserver.api.batch.firstCommand) {
          line = `,\n${line}`;
        }
        cncserver.api.batch.fs.appendFileSync(
          cncserver.api.batch.saveFile,
          line
        );
      } else {
        cncserver.api.batch.data.push(entry);
      }
      cncserver.api.batch.firstCommand = false;
    },

    /**
     * End the batch and return the data saved.
     *
     * @return {object|string}
     *   Full data array if local, otherwise the file path if saved directly.
     */
    endReturn: () => {
      let dump = [];

      if (cncserver.api.batch.saveFile) {
        cncserver.api.batch.finishFile();
        dump = cncserver.api.batch.saveFile;
      } else {
        dump = cncserver.api.batch.data;
      }

      cncserver.api.batch.endClear();
      return dump;
    },

    /**
     * End the batch and send the data immediately.
     *
     * @param  {Function} callback
     *   Function called when sending is complete.
     * @param  {object}   options
     *   Keyed options object, currently supports:
     *     * fileOverride: path/URL that the server should have read access to
     *     as opposed to the one that the node client has write access to.
     */
    endSend: (callback, options = {}) => {
      let dump;

      // File or raw data?
      if (cncserver.api.batch.saveFile) {
        cncserver.api.batch.finishFile();

        // Allow client to specify the end send file path differently.
        if (options.fileOverride) {
          dump = { file: options.fileOverride };
        } else {
          dump = { file: cncserver.api.batch.saveFile };
        }
      } else {
        // Send the actual data directly.
        dump = cncserver.api.batch.data;
      }

      cncserver.api.batch.endClear();
      console.time('process-batch');
      _post('batch', {
        data: dump,
        timeout: 1000 * 60 * 10, // Timeout of 10 mins!
        success: (d) => {
          console.timeEnd('process-batch');
          console.info(d);
          callback();
        },
      });
    },

    /**
     * Reset all batch state to default.
     */
    endClear: () => {
      cncserver.api.batch.firstCommand = true;
      cncserver.api.batch.data = [];
      cncserver.api.batch.saveFile = '';
      cncserver.api.batch.skipSend = false;
    }
  },
};
