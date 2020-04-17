/**
 * @file Holds all CNC Server API controller functions and RESTful interactions
 * abstracted for use in the client side application. Includable as DOM JS, or
 * as a Node module.
 *
 * In use, must init:
 *
 * cncserver.init({
 *   domain: 'localhost',
 *   port: 4242,
 *   protocol: 'http',
 *   version: '1'
 * });
 */
/* eslint-env browser, node */

let axios = {}; // Placeholder.

// Initialize wrapper object is this library is being used elsewhere
const cncserver = {
  init: ({
    domain = 'localhost',
    port = 4242,
    protocol = 'http',
    version = 2,
    ax,
    socketio,
  }) => new Promise((resolve) => {
    axios = ax;
    if (socketio) {
      cncserver.socket = socketio(`${protocol}://${domain}:${port}`);
    }

    cncserver.api.server = {
      domain,
      port,
      protocol,
      version,
    };

    if (Event && document) {
      const initComplete = new Event('cncserver-init');
      document.dispatchEvent(initComplete);
    }

    // Resolve the promise when initialized.
    resolve();
  }),
};

// Define central request setup.
function _request(method, path, options = {}) {
  const { server: srv } = cncserver.api;
  if (!srv) {
    const message = 'CNC Server API client domain configuration not ready. \
    Set cncserver.api.server correctly!';
    return Promise.reject(new Error(message));
  }

  let srvPath = '';

  // If given an absolute server path, use it directly
  if (path[0] === '/') {
    srvPath = path;
  } else {
    // Otherwise, construct an absolute path from versioned API path
    srvPath = `/v${srv.version}/${path}`;
  }

  const url = `${srv.protocol}://${srv.domain}:${srv.port}${srvPath}`;

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
    return Promise.resolve({});
  }

  // Initiate and return the request promise chain.
  return axios.request({
    url,
    method,
    data: options.data,
    timeout: options.timeout || 5000,
  });
}

// Define request base wrappers.
function _get(path, options) {
  return _request('get', path, options);
}
function _post(path, options) {
  return _request('post', path, options);
}
function _put(path, options) {
  return _request('put', path, options);
}
function _patch(path, options) {
  return _request('patch', path, options);
}
function _delete(path, options) {
  return _request('delete', path, options);
}
function _options(path) {
  return _request('options', path);
}

/**
 * Restful API wrappers
 */
cncserver.api = {
  projects: {
    /**
     * TODO: Basic docs for these wrappers.
     */
    stat: () => _get('projects'),
    open: hash => _patch('projects', { data: { current: hash } }),
    add: data => _post('projects', { data }),

    item: {
      stat: hash => _get(`projects/${hash}`),
      update: (hash, data) => _patch(`projects/${hash}`, { data }),
      delete: hash => _delete(`projects/${hash}`),
    },
    renderStage: () => _patch('projects', { data: { rendering: true } }),
    drawPreview: () => _patch('projects', { data: { drawing: true } }),
    options: () => _options('projects'),
  },
  content: {
    stat: () => _get('content'),
    add: {
      direct: data => _post('content', { data }),
      local: (type, content, options = {}) => _post('content', {
        data: { ...options, source: { type, content } },
      }),
      remote: (type, url, options = {}) => _post('content', {
        data: { ...options, source: { type, url } },
      }),
    },

    item: {
      stat: hash => _get(`content/${hash}`),
      update: (hash, data) => _patch(`content/${hash}`, { data }),
      delete: hash => _delete(`content/${hash}`),
    },
    delete: () => _delete('content'), // Remove all content from project.
    options: () => _options('content'),
  },
  colors: {
    stat: () => _get('colors'),
    preset: preset => _post('colors', { data: { preset } }),
    add: data => _post('colors', { data }),
    save: data => _put(`colors/${data.id}`, { data }),
    delete: id => _delete(`colors/${id}`),
  },
  pen: {
    /**
     * Get pen stat without doing anything else. Directly sets state.
     */
    stat: () => _get('pen'),

    /**
     * Set pen position height
     * @param {float|string} value
     *   0 to 1 float, and named constants
     * @param {object} options
         Options object with key overrides.
     */
    height: (value, options = {}) => _put('pen', { data: { ...options, state: value } }),

    // Shortcut call to the above with flop set to true
    up: options => cncserver.api.pen.height(0, options),

    // Shortcut call to the above with flop set to true
    down: options => cncserver.api.pen.height(1, options),

    /**
     * Set power of the pen
     * @param {float|string} value
     *   0 to 1 float
     */
    power: value => _put('pen', { data: { power: value } }),

    /**
     * Reset server state for distanceCounter
     */
    resetCounter: () => _put('pen', { data: { resetCounter: 1 } }),

    /**
     * Move pen to parking position outside drawing canvas
     */
    park: (options = {}) => _delete('pen', { data: options }),

    /**
     * Reset the server state of the pen position to 0,0, parking position
     */
    zero: () => _put('motors', { data: { reset: 1 } }),

    /**
     * Set pen to absolute x/y point within defined cncserver canvas width/height
     * @param {object} point
     *   {x, y} point object of coordinate within 0-100% of canvas to move to,
     *   or with `abs` key set to 'mm' or 'in' for absolute position.
     */
    move: (point) => {
      if (typeof point === 'undefined') {
        return Promise.reject(new Error('Invalid coordinates for move'));
      }

      let { x, y } = point;

      // Sanity check inputs
      x = x < 0 ? 0 : Number(x);
      y = y < 0 ? 0 : Number(y);

      if (!point.abs) {
        x = x > 100 ? 100 : x;
        y = y > 100 ? 100 : y;
      }

      return _put('pen', { data: { x, y, ...point } });
    },
  },

  motors: {
    /**
     * Disable motors, allow them to be turned by hand
     * @param {object} options
     *   Object of key:value sets to pass to the API request.
     */
    unlock: options => _delete('motors', { data: options }),
  },
  tools: {
    /**
     * List the available tools for the current bot type
     */
    list: () => _get('tools'),

    /**
     * Change to a given tool
     * @param {string} toolName
     *   Machine name of tool to switch to
     * @param {function} options
     *   The base of the full object to send for API options
     */
    change: (toolName, options = {}) => _put(`tools/${toolName}`, { data: options }),
  },

  buffer: {
    /**
     * Pause all bot operations until resumed
     */
    pause: () => _put('buffer', { data: { paused: true } }),

    /**
     * Pause all bot operations until resumed
     */
    resume: () => _put('buffer', { data: { paused: false } }),

    /**
     * Toggle bot operations
     */
    toggle: doPause => (doPause ? cncserver.api.buffer.resume() : cncserver.api.buffer.pause()),

    /**
     * Push a message into the buffer
     */
    message: message => _post('buffer', { data: { message } }),

    /**
     * Push a callback name into the buffer
     */
    callbackname: name => _post('buffer', { data: { callback: name } }),

    /**
     * Pause all bot operations until resumed
     */
    clear: () => _delete('buffer'),
  },

  settings: {
    /**
     * Get the cncserver global settings object
     */
    global: () => _get('settings/global'),

    /**
     * Get the cncserver bot specific settings object
     */
    bot: () => _get('settings/bot'),
  },

  // Scratch turtle/abstracted API, non-ReSTful.
  scratch: {
    move: (direction, amount) => new Promise((success) => {
      _get(`/move.${direction}./${amount}`).then(() => {
        cncserver.api.scratch.stat().then(success);
      });
    }),
    stat: () => new Promise((success) => {
      _get('/poll').then(({ data }) => {
        const out = {};
        data.split('\n').forEach((item) => {
          const [key, val] = item.split(' ');
          out[key] = val;
        });
        success(out);
      });
    }),
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
      // Unset waitForCompletion as it's not allowed with batch.
      if (data.waitForCompletion) delete data.waitForCompletion;

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
    },
  },
};

// Module export.
export default cncserver;
