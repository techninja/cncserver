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

/*globals $ */

// Initialize wrapper object is this library is being used elsewhere
if (typeof cncserver === 'undefined') var cncserver = {};

// Detect NodeJS vs Browser:
var isNode = false;
try {
  var op = Object.prototype;
  isNode = op.toString.call(global.process) === '[object process]';
} catch(e) {}

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
    stat: function(callback){
      _get('pen', {
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Set pen position height
    * @param {function} callback
    *   Function to callback when done, including data from response body
    * @param {float|string} value
    *   0 to 1 float, and named constants
    */
    height: function(value, callback, options){
      if (typeof options !== 'object') options = {};
      options.state = value;

      // If we're on node and we have a socket, shortcut via WebSockets.
      // TODO: FIX this as causes socket.io call stack overflows
      if (isNode && cncserver.global.socket && false) {
        var data = {state: value, returnData: !!callback};
        cncserver.global.socket.emit('height', data);
        if (callback) {
          var catchMove = function(d){
            callback(d);
            cncserver.global.socket.removeListener('height', catchMove);
          };

          cncserver.global.socket.on('height', catchMove);
        }

        // Leave this entire function to avoid doing the regular request.
        return;
      }


      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put('pen', {
        data: options,
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

    // Shortcut call to the above with flop set to true
    up: function(callback, options) {
      this.height(0, callback, options);
    },

    // Shortcut call to the above with flop set to true
    down: function(callback, options) {
      this.height(1, callback, options);
    },

    /**
    * Set power of the pen
    * @param {float|string} value
    *   0 to 1 float
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    power: function(value, callback){
      _put('pen', {
        data: {power: value},
        success: function(d){
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Reset server state for distanceCounter
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    resetCounter: function(callback){
      _put('pen', {
        data: { resetCounter: 1},
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Move pen to parking position outside drawing canvas
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    park: function(callback, options){
      if (typeof options !== 'object') options = {};

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _delete('pen',{
        data: options,
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (!isNode) $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

    /**
    * Reset the server state of the pen position to 0,0, parking position
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    zero: function(callback){
      _put('motors',{
        data: {reset: 1},
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: function(e) {
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
    move: function(point, callback){
      if (typeof point === 'undefined') {
        if (callback) callback(false);
        return;
      }

      if (!isNode) $(cncserver.api).trigger('movePoint', [point]);

      // Sanity check inputs
      point.x = point.x > 100 ? 100 : point.x;
      point.y = point.y > 100 ? 100 : point.y;
      point.x = point.x < 0 ? 0 : point.x;
      point.y = point.y < 0 ? 0 : point.y;

      // If we're on node and we have a socket, shortcut via WebSockets.
      // TODO: FIX this as causes socket.io call stack overflows
      if (isNode && cncserver.global.socket && false) {
        if (typeof point.returnData === 'undefined') {
          point.returnData = !!callback;
        }

        cncserver.global.socket.emit('move', point);
        if (callback) {
          if (!point.returnData){
            callback({});
          } else {
            var catchMove = function(d){
              callback(d);
              cncserver.global.socket.removeListener('move', catchMove);
            };

            cncserver.global.socket.on('move', catchMove);
          }
        }

        // Leave this entire function to avoid doing the regular request.
        return;
      }

      // Ignore timeout with no callback by default
      if (typeof point.ignoreTimeout === 'undefined') {
        point.ignoreTimeout = callback ? '' : '1';
      }

      _put('pen', {
        data: point,
        success: function(d){
          if (!isNode) $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
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
    unlock: function(callback, options){
      _delete('motors', {
        data: options,
        success: callback,
        error: function(e) {
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
    list: function(callback){
      _get('tools', {
        success: callback,
        error: function(e) {
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
    change: function(toolName, callback, options){
      if (!isNode) $(cncserver.api).trigger('offCanvas');
      if (!isNode) $(cncserver.api).trigger('toolChange');

      if (typeof options !== 'object') options = {};

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout === 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put('tools/' + toolName, {
        success: callback,
        data: options,
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    }
  },

  buffer: {
   /**
    * Pause all bot operations until resumed
    */
    pause: function(callback){
      _put('buffer', {
        data: {paused: true},
        success: function(d) {
          if (!isNode) $(cncserver.api).trigger('paused');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Pause all bot operations until resumed
    */
    resume: function(callback){
      _put('buffer', {
        data: {paused: false},
        success: function(d) {
          if (!isNode) $(cncserver.api).trigger('resumed');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Push a message into the buffer
    */
    message: function(message, callback){
      _post('buffer', {
        data: {message: message},
        success: function(d) {
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Push a callback name into the buffer
    */
    callbackname: function(name, callback){
      _post('buffer', {
        data: {callback: name},
        success: function(d) {
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false, e);
        }
      });
    },

   /**
    * Pause all bot operations until resumed
    */
    clear: function(callback){
      _delete('buffer', {
        success: callback,
        error: function(e) {
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
    global: function(callback){
      _get('settings/global', {
        success: callback,
        error: function(e) {
          callback(false, e);
        }
      });
    },

   /**
    * Get the cncserver bot specific settings object
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    bot: function(callback){
      _get('settings/bot', {
        success: callback,
        error: function(e) {
          callback(false, e);
        }
      });
    },
  },

  // Scratch turtle/abstracted API, non-ReSTful.
  scratch: {
    move: function(direction, amount, callback) {
      _get('/move.' + direction + './' + amount,
        {
          success: function() {
            _get('/poll', {success: function(d){
              // Callback return objectified /poll data
              var data = d.split("\n");
              var out = {};
              for (var i in data) {
                var line = data[i].split(' ');
                out[line[0]] = line[1];
              }
              callback(out);
            }});
          }
        }
      );
    }
  }
};

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

if (isNode) {
  var request = require('request');

  // As a node module, just pass your cncserver object, and the api.server obj.
  module.exports = function(cncmain, server) {
    cncmain.api = cncserver.api;
    cncmain.api.server = server;
    cncserver.global = cncmain;
  };
}

function _request(method, path, options) {
  var srv = cncserver.api.server;
  if (!srv) {
    console.error('CNC Server API client domain configuration not ready. Set cncserver.api.server correctly!');
    return;
  }

  var srvPath = "";

  // If given an absolute server path, use it directly
  if (path[0] === '/') {
    srvPath = path;
  } else { // Otherwise, construct an absolute path from versioned API path
    srvPath = '/v' + srv.version + '/' + path;
  }

  var uri = srv.protocol + '://' + srv.domain + ':' + srv.port + srvPath;
  if (!isNode) {
    $.ajax({
      url: uri,
      type: method,
      data: options.data,
      success: options.success,
      error: options.error,
      timeout: options.error
    });
  } else {
    request({
      uri: uri,
      json: true,
      method: method,
      body: options.data,
      timeout: 1000
    }, function(error, response, body){
      if (error) {
        console.error(error);
        if (options.error) options.error(error, response, body);
      } else {
        if (options.success) options.success(body, response);
      }
    });
  }
}
