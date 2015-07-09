/*global console */
/*
 * @file The official client-side JavaScript based Scratch 2.0 extension for
 * CNCServer and WaterColorBot. Should mirror the abilities of the .s2e
 * Scratch 2 Offline extension.
 */

(function(ext) {
  "use strict";
  // Initialize the default server location
  var cncserver = {
    api: {
      server:{
        domain: 'localhost',
        port: 4242,
        protocol: 'http'
      }
    }
  };

  // Cleanup function when the extension is unloaded
  ext._shutdown = function() {};

  // Status reporting code
  // Use this to report missing hardware, plugin or unsupported browser
  ext._getStatus = function() {
      return {status: 2, msg: 'Ready'};
  };

  // Block and block menu descriptions
  // These are exactly the same from the the watercolorbot_scratch.s2e offline
  // extension, except the endpoints are converted to functions.
  var descriptor = {
    blocks: [
      [" ", "park", "park"],
      [" ", "wash brush", "pen_wash"],
      [" ", "brush up", "pen_up"],
      [" ", "brush down", "pen_down"],
      [" ", "reload paint every %d.distance cm", "penreink", 48],
      [" ", "end paint reloading", "penstopreink"],
      [" ", "wait %d.time seconds", "move_wait", 0.5],
      [" ", "move to x: %n y: %n", "coord", 0, 0],
      [" ", "move to %m.positionY %m.positionX", "coord", "center", "center"],
      [" ", "get color %d.colors", "tool_color", 0],
      [" ", "get water %d.waters", "tool_water", 0],
      [" ", "move brush %n steps", "move_forward", 10],
      [" ", "move brush x %n steps", "move_nudge_x", 10],
      [" ", "move brush y %n steps", "move_nudge_y", 10],
      [" ", "turn brush @turnRight %d.angle degrees", "move_right", "15"],
      [" ", "turn brush @turnLeft %d.angle degrees", "move_left", "15"],
      [" ", "point brush towards %d.angle degrees", "move_absturn", "0"],
      [" ", "point brush towards x: %n y: %n", "move_toward", "0", "0"],
      [" ", "set move speed to %d.speed", "move_speed", "7"],
      [" ", "motors off & zero", "pen_off"],
      [" ", "reset paint distance", "pen_resetDistance"],
      [" ", "put brush to sleep", "pen_sleep_1"],
      [" ", "wake up brush!", "pen_sleep_0"],
      ["R", "brush x", "get_x"],
      ["R", "brush y", "get_y"],
      ["R", "brush z", "get_z"],
      ["R", "brush paint distance", "get_distanceCounter"],
      ["R", "is sleeping?", "get_sleeping"],
      ["R", "brush angle", "get_angle"]
    ],
    menus: {
      colors: [0, 1, 2, 3, 4, 5, 6, 7],
      distance: [5, 10, 15, 20, 30, 48, 60, 70],
      speed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      waters: [0, 1, 2],
      positionX: ["left", "center", "right"],
      positionY: ["top", "center", "bottom"],
      angle: [0, 5, 15, 30, 45, 90, 135, 180, 270],
      time: [0.25, 0.5, 0.75, 1, 2, 5, 10]
    }
  };

  // ===========================================================================
  // Convert all the function endpoint wrappers into something real!
  // ===========================================================================
  ext.park = function() { _get('park');};
  ext.pen_wash = function() { _get('pen.wash');};
  ext.pen_up = function() { _get('pen.up');};
  ext.pen_down = function() { _get('pen.down');};
  ext.penreink = function(d) { _get('penreink/' + d);};
  ext.penstopreink = function() { _get('penstopreink');};
  ext.move_wait = function(w) { _get('move.wait./' + w);};
  ext.coord = function(x, y) { _get('coord/' + [x, y].join('/'));};
  ext.tool_color = function(c) { _get('tool.color./' + c);};
  ext.tool_water = function(c) { _get('tool.water./' + c);};
  ext.move_forward = function(d) { _get('move.forward./' + d);};
  ext.move_nudge_x = function(d) { _get('move.nudge.x./' + d);};
  ext.move_nudge_y = function(d) { _get('move.nudge.y./' + d);};
  ext.move_right = function(d) { _get('move.right./' + d);};
  ext.move_left = function(d) { _get('move.left./' + d);};
  ext.move_absturn = function(d) { _get('move.absturn./' + d);};
  ext.move_toward = function(x, y) { _get('move.toward./' + [x, y].join('/'));};
  ext.move_speed = function(s) { _get('move.speed./' + s);};
  ext.pen_off = function() { _get('pen.off');};
  ext.pen_resetDistance = function() { _get('pen.resetDistance');};
  ext.pen_sleep_1 = function() { _get('pen.sleep.1');};
  ext.pen_sleep_0 = function() { _get('pen.sleep.0');};


  ext.get_x = function(cb) { _report('x', cb); };
  ext.get_y = function(cb) { _report('y', cb); };
  ext.get_z = function(cb) { _report('z', cb); };
  ext.get_distanceCounter = function(cb) { _report('distanceCounter', cb); };
  ext.get_sleeping = function(cb) { _report('sleeping', cb); };
  ext.get_angle = function(cb) { _report('angle', cb); };

  // Helper function for parsing data from the "/poll" Scratch offline endpoint
  function _report(name, cb) {
    _get('poll', {
      complete: function(data) {
        var lines = data.split("\n");
        for (var i in lines) {
          var line = lines[i].split(' ');
          if (name === line[0]) {
            cb(line[1]);
            return;
          }
        }
      }
    });
  }

  // ===========================================================================
  // CNCServer API wrapper GET approximation for all requests. This is a very
  // dumbed down wrapper to allow for only the common Scratch API GET requests.
  // ===========================================================================
  function _get(path, options) {
    var srv = cncserver.api.server;
    var url = srv.protocol + '://' + srv.domain + ':' + srv.port + '/' + path;

    if (!options) options = {}; // Default to object if not passed

    console.log("Getting: ", url);
    $.ajax({
      url: url,
      type: 'GET',
      success: options.complete,
      error: options.complete,
      timeout: options.complete
    });
  }

  // Register the extension
  ScratchExtensions.register('WaterColorBlocks', descriptor, ext);
})({});
