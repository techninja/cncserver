/**
 * @file The official client-side JavaScript based Scratch 2.0 extension for
 * CNCServer and WaterColorBot. Should mirror the abilities of the .s2e
 * Scratch 2 Offline extension.
 */
/* eslint-disable no-param-reassign, strict */
/* eslint-env browser */
/* globals $, ScratchExtensions */

((ext) => {
  'use strict';

  // Initialize the default server location
  const cncserver = {
    api: {
      server: {
        domain: 'localhost',
        port: 4242,
        protocol: 'http',
      },
    },
  };

  // Cleanup  when the => extension is unloaded
  ext._shutdown = () => {};

  // Status reporting code
  // Use this to report missing hardware, plugin or unsupported browser
  ext._getStatus = () => ({ status: 2, msg: 'Ready' });

  // Block and block menu descriptions
  // These are exactly the same from the the watercolorbot_scratch.s2e offline
  // extension, except the endpoints are converted to functions.
  const descriptor = {
    blocks: [
      [' ', 'park', 'park'],
      [' ', 'wash brush', 'pen_wash'],
      [' ', 'brush up', 'pen_up'],
      [' ', 'brush down', 'pen_down'],
      [' ', 'reload paint every %d.distance cm', 'penreink', 48],
      [' ', 'end paint reloading', 'penstopreink'],
      [' ', 'wait %d.time seconds', 'move_wait', 0.5],
      [' ', 'move to x: %n y: %n', 'coord', 0, 0],
      [' ', 'move to %m.positionY %m.positionX', 'coord', 'center', 'center'],
      [' ', 'get color %d.colors', 'tool_color', 0],
      [' ', 'get water %d.waters', 'tool_water', 0],
      [' ', 'move brush %n steps', 'move_forward', 10],
      [' ', 'move brush x %n steps', 'move_nudge_x', 10],
      [' ', 'move brush y %n steps', 'move_nudge_y', 10],
      [' ', 'turn brush @turnRight %d.angle degrees', 'move_right', '15'],
      [' ', 'turn brush @turnLeft %d.angle degrees', 'move_left', '15'],
      [' ', 'point brush towards %d.angle degrees', 'move_absturn', '0'],
      [' ', 'point brush towards x: %n y: %n', 'move_toward', '0', '0'],
      [' ', 'set move speed to %d.speed', 'move_speed', '7'],
      [' ', 'motors off & zero', 'pen_off'],
      [' ', 'reset paint distance', 'pen_resetDistance'],
      [' ', 'put brush to sleep', 'pen_sleep_1'],
      [' ', 'wake up brush!', 'pen_sleep_0'],
      ['R', 'brush x', 'get_x'],
      ['R', 'brush y', 'get_y'],
      ['R', 'brush z', 'get_z'],
      ['R', 'brush paint distance', 'get_distanceCounter'],
      ['R', 'is sleeping?', 'get_sleeping'],
      ['R', 'brush angle', 'get_angle'],
    ],
    menus: {
      colors: [0, 1, 2, 3, 4, 5, 6, 7],
      distance: [5, 10, 15, 20, 30, 48, 60, 70],
      speed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      waters: [0, 1, 2],
      positionX: ['left', 'center', 'right'],
      positionY: ['top', 'center', 'bottom'],
      angle: [0, 5, 15, 30, 45, 90, 135, 180, 270],
      time: [0.25, 0.5, 0.75, 1, 2, 5, 10],
    },
  };

  // ===========================================================================
  // CNCServer API wrapper GET approximation for all requests. This is a very
  // dumbed down wrapper to allow for only the common Scratch API GET requests.
  // ===========================================================================
  function _get(path, options) {
    const srv = cncserver.api.server;
    const url = `${srv.protocol}://${srv.domain}:${srv.port}/${path}`;

    if (!options) options = {}; // Default to object if not passed

    console.log('Getting: ', url);
    $.ajax({
      url,
      type: 'GET',
      success: options.complete,
      error: options.complete,
      timeout: options.complete,
    });
  }

  // Helper function for parsing data from the "/poll" Scratch offline endpoint
  function _report(name, cb) {
    _get('poll', {
      complete: (data) => {
        const lines = data.split('\n');
        lines.forEach((pollLine) => {
          const line = pollLine.split(' ');
          if (name === line[0]) {
            cb(line[1]);
          }
        });
      },
    });
  }

  // ===========================================================================
  // Convert all the function endpoint wrappers into something real!
  // ===========================================================================
  ext.park = () => { _get('park'); };
  ext.pen_wash = () => { _get('pen.wash'); };
  ext.pen_up = () => { _get('pen.up'); };
  ext.pen_down = () => { _get('pen.down'); };
  ext.penreink = (d) => { _get(`penreink/${d}`); };
  ext.penstopreink = () => { _get('penstopreink'); };
  ext.move_wait = (w) => { _get(`move.wait./${w}`); };
  ext.coord = (x, y) => { _get(`coord/${[x, y].join('/')}`); };
  ext.tool_color = (c) => { _get(`tool.color./${c}`); };
  ext.tool_water = (c) => { _get(`tool.water./${c}`); };
  ext.move_forward = (d) => { _get(`move.forward./${d}`); };
  ext.move_nudge_x = (d) => { _get(`move.nudge.x./${d}`); };
  ext.move_nudge_y = (d) => { _get(`move.nudge.y./${d}`); };
  ext.move_right = (d) => { _get(`move.right./${d}`); };
  ext.move_left = (d) => { _get(`move.left./${d}`); };
  ext.move_absturn = (d) => { _get(`move.absturn./${d}`); };
  ext.move_toward = (x, y) => { _get(`move.toward./${[x, y].join('/')}`); };
  ext.move_speed = (s) => { _get(`move.speed./${s}`); };
  ext.pen_off = () => { _get('pen.off'); };
  ext.pen_resetDistance = () => { _get('pen.resetDistance'); };
  ext.pen_sleep_1 = () => { _get('pen.sleep.1'); };
  ext.pen_sleep_0 = () => { _get('pen.sleep.0'); };

  ext.get_x = (cb) => { _report('x', cb); };
  ext.get_y = (cb) => { _report('y', cb); };
  ext.get_z = (cb) => { _report('z', cb); };
  ext.get_distanceCounter = (cb) => { _report('distanceCounter', cb); };
  ext.get_sleeping = (cb) => { _report('sleeping', cb); };
  ext.get_angle = (cb) => { _report('angle', cb); };

  // Register the extension
  ScratchExtensions.register('WaterColorBlocks', descriptor, ext);
})({});
