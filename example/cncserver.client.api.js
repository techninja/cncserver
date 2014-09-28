/**
 * @file Holds all CNC Server API controller functions and RESTful interactions
 * abstracted for use in the client side application
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

// Initialize wrapper object is this library is being used elsewhere
if (typeof cncserver === 'undefined') var cncserver = {};

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
          $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout == 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put('pen', {
        data: options,
        success: function(d){
          $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
    * Reset server state for distanceCounter
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    resetCounter: function(callback){
      _put('pen', {
        data: { resetCounter: 1},
        success: function(d){
          $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
      if (typeof options.ignoreTimeout == 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _delete('pen',{
        data: options,
        success: function(d){
          $(cncserver.api).trigger('updatePen', [d]);
          $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
          $(cncserver.api).trigger('offCanvas');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
      if (point == undefined) {
        if (callback) callback(false);
        return;
      }

      $(cncserver.api).trigger('movePoint', [point]);

      // Sanity check inputs
      point.x = point.x > 100 ? 100 : point.x;
      point.y = point.y > 100 ? 100 : point.y;
      point.x = point.x < 0 ? 0 : point.x;
      point.y = point.y < 0 ? 0 : point.y;

      // Ignore timeout with no callback by default
      if (typeof point.ignoreTimeout == 'undefined') {
        point.ignoreTimeout = callback ? '' : '1';
      }

      _put('pen', {
        data: point,
        success: function(d){
          $(cncserver.api).trigger('updatePen', [d]);
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
        }
      });
    }
  },

  motors: {
   /**
    * Disable motors, allow them to be turned by hand
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    unlock: function(callback){
      _delete('motors', {
        success: callback,
        error: function(e) {
          callback(false);
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
          if (callback) callback(false);
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
      $(cncserver.api).trigger('offCanvas');
      $(cncserver.api).trigger('toolChange');

      if (typeof options !== 'object') options = {};

      // Ignore timeout with no callback by default
      if (typeof options.ignoreTimeout == 'undefined') {
        options.ignoreTimeout = callback ? '' : '1';
      }

      _put('tools/' + toolName, {
        success: callback,
        data: options,
        error: function(e) {
          if (callback) callback(false);
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
          $(cncserver.api).trigger('paused');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
          $(cncserver.api).trigger('resumed');
          if (callback) callback(d);
        },
        error: function(e) {
          if (callback) callback(false);
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
          if (callback) callback(false);
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
          if (callback) callback(false);
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
          if (callback) callback(false);
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
          callback(false);
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
          callback(false);
        }
      });
    },
  },
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

function _request(method, path, options) {
  var srv = cncserver.api.server;
  if (!srv) {
    console.error('CNC Server API client domain configuration not ready. Set cncserver.api.server correctly!');
    return;
  }

  $.ajax({
    url: srv.protocol + '://' + srv.domain + ':' + srv.port + '/v' + srv.version + '/' + path,
    type: method,
    data: options.data,
    success: options.success,
    error: options.error,
    timeout: options.error
  });
}
