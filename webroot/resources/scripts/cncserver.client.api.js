/**
 * @file Holds all CNC Server API controller functions and RESTful interactions
 * abstracted for use in the client side application
 */
cncserver.api = {
  pen: {
   /**
    * Get pen stat without doing anything else. Directly sets state.
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    stat: function(callback){
      _get('pen', {success: function(d){
          cncserver.state.pen = d;
          if (callback) callback(d);
      }});
    },

   /**
    * Set pen position up (not drawing)
    * @param {function} callback
    *   Function to callback when done, including data from response body
    * @param {boolean} flop
    *   Set to true to swap pen position state to 1 (down/draw)
    */
    up: function(callback, flop){
      // Short circuit if state already matches local state
      if (cncserver.state.pen.state == flop ? 1 : 0) {
        callback(cncserver.state.pen);
        return;
      }

      _put('pen', {
        data: { state: flop ? 1 : 0}, // 0 is off (no draw), 1 is on (do draw)
        success: function(d){
          cncserver.state.pen = d;
          if (callback) callback(d);
      }});
    },

    // Shortcut call to the above with flop set to true
    down: function(callback) {
      this.up(callback, true);
    },

   /**
    * Reset server state for distanceCounter
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    reset: function(callback){
      _put('pen', {
        data: { resetCounter: 1},
        success: function(d){
          cncserver.state.pen = d;
          if (callback) callback(d);
      }});
    },

   /**
    * Move pen to parking position outside drawing canvas
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    park: function(callback){
      _delete('pen',{
        success: function(d){
          cncserver.state.pen = d;
          if (callback) callback(d);
      }});
    },

   /**
    * Set pen to absolute x/y point within defined cncserver canvas width/height
    * @param {object} point
    *   {x,y} point object of coordinate within width/height of canvas to move to
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    move: function(point, callback){
      if (point == undefined) {
        if (callback) callback(false);
        return;
      }

      cncserver.moveDrawPoint(point);

      var percent = {
        x: (point.x / cncserver.canvas.width) * 100,
        y: (point.y / cncserver.canvas.height) * 100
      }

      // Sanity check outputs
      percent.x = percent.x > 100 ? 100 : percent.x;
      percent.y = percent.y > 100 ? 100 : percent.y;
      percent.x = percent.x < 0 ? 0 : percent.x;
      percent.y = percent.y < 0 ? 0 : percent.y;

      _put('pen', {
        data: {
          x: percent.x,
          y: percent.y,
          ignoreTimeout: point.ignoreTimeout
        },
        success: function(d){
          cncserver.state.pen = d;
          if (callback) callback(d);
      }});
    }
  },

  motors: {
   /**
    * Disable motors, allow them to be turned by hand
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    unlock: function(callback){
      _delete('motors', {success: callback});
    }
  },

  tools: {
   /**
    * Change to a given tool
    * @param {string} toolName
    *   Machine name of tool to switch to
    * @param {function} callback
    *   Function to callback when done, including data from response body
    */
    change: function(toolName, callback){
      _put('tools/' + toolName, {success: callback});
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

function _request(method, path, options) {
  $.ajax({
    url: '/' + path,
    type: method,
    data: options.data,
    success: options.success,
    error: options.error
  });
}
