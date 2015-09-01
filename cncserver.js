/*jslint node: true */
"use strict";

/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Supports EiBotBoard for Eggbot, Ostrich Eggbot and Sylvia's Super-Awesome
 * WaterColorBot
 *
 * This script can be run standalone via 'node cncserver.js' with command line
 * options as described in the readme, or as a module: example shown:
 *
 * var cncserver = require('cncserver');
 *
 * cncserver.conf.global.overrides({
 *   httpPort: 1234,
 *   swapMotors: true
 * });
 *
 * cncserver.start({
 *   error: function callback(err){ // ERROR! },
 *   success: function callback(){ // SUCCESS! },
 *   disconnect: function callback(){ //BOT DISCONNECTED! }
 * };
 *
 */

// REQUIRES ====================================================================
var nconf = require('nconf');              // Configuration and INI file
var express = require('express');          // Express Webserver Requires --=-=-=
var app = express();
var server = require('http').createServer(app);
var fs = require('fs');                    // File System management
var path = require('path');                // Path management and normalization
var extend = require('util')._extend;      // Util for cloning objects
var io = require('socket.io')(server);     // Socket.io for streaming state data

var scratch = require('./cncserver.scratch.js'); // Scratch support/API addition

// CONFIGURATION ===============================================================
var cncserver = { // Master object for holding stuff!
  gConf: new nconf.Provider(),
  botConf: new nconf.Provider(),
  bot: {} // Holds clean rendered settings set after botConfig is loaded
};

// Pull conf from env, or arguments
cncserver.gConf.env().argv();

// SOCKET DATA STREAM ==========================================================
io.on('connection', function(socket){
  // Send buffer and pen updates on user connect
  sendPenUpdate();

  // TODO: this likely needs to be sent ONLY to new connections
  sendBufferComplete();

  socket.on('disconnect', function(){
    //console.log('user disconnected');
  });

});

/**
 * Send an update to all Stream clients about the actualPen object.
 * Called whenever actualPen object has been changed, E.G.: right before
 * a serial command is run, or internal state changes.
 */
cncserver.sendPenUpdate = sendPenUpdate;
function sendPenUpdate() {
  // Low-level event callback trigger to avoid Socket.io overhead
  if (exports.penUpdateTrigger) {
    exports.penUpdateTrigger(cncserver.actualPen);
  } else {
    // TODO: This sucks, but even sending these smaller packets is somewhat
    // blocking and screws with buffer send timing. Need to either make these
    // packets smaller, or limit the number of direct updates per second to the
    // transfer rate to clients? Who knows.
    io.emit('pen update', cncserver.actualPen);
  }
}

/**
 * Send an update to all stream clients when something is added to the buffer.
 * Includes only the item added to the buffer, expects the client to handle.
 */
function sendBufferAdd(item) {
  var data = {
    type: 'add',
    item: item
  };

  // Low-level event callback trigger to avoid Socket.io overhead
  if (exports.bufferUpdateTrigger) {
    exports.bufferUpdateTrigger(data);
  } else {
    io.emit('buffer update', data);
  }
}


/**
 * Send an update to all stream clients when something is removed from the
 * buffer. Assumes the client knows where to remove from.
 */
function sendBufferRemove() {
  var data = {
    type: 'remove'
  };

  // Low-level event callback trigger to avoid Socket.io overhead
  if (exports.bufferUpdateTrigger) {
    exports.bufferUpdateTrigger(data);
  } else {
    io.emit('buffer update', data);
  }
}

/**
 * Send an update to all stream clients when something is added to the buffer.
 * Includes only the item added to the buffer, expects the client to handle.
 */
function sendBufferVars() {
  var data = {
    type: 'vars',
    bufferRunning: bufferRunning,
    bufferPaused: bufferPaused,
    bufferPausePen: bufferPausePen
  };

  // Low-level event callback trigger to avoid Socket.io overhead
  if (exports.bufferUpdateTrigger) {
    exports.bufferUpdateTrigger(data);
  } else {
    io.emit('buffer update', data);
  }
}

/**
 * Send an update to all stream clients about everything buffer related.
 * Called only during connection inits.
 */
cncserver.sendBufferComplete = sendBufferComplete;
function sendBufferComplete() {
  var data = {
    type: 'complete',
    buffer: buffer,
    bufferRunning: bufferRunning,
    bufferPaused: bufferPaused,
    bufferPausePen: bufferPausePen
  };

  // Low-level event callback trigger to avoid Socket.io overhead
  if (exports.bufferUpdateTrigger) {
    exports.bufferUpdateTrigger(data);
  } else {
    io.emit('buffer update', data);
  }
}

/**
 * Send an update to all stream clients of the given custom text string.
 *
 * @param {string} message
 *   Message to send out to all clients.
 */
function sendMessageUpdate(message) {
  io.emit('message update', {
    message: message,
    timestamp: new Date().toString()
  });
}

/**
 * Send an update to all stream clients of a machine name callback event.
 *
 * @param {string} name
 *   Machine name of callback to send to clients
 */
function sendCallbackUpdate(name) {
  io.emit('callback update', {
    name: name,
    timestamp: new Date().toString()
  });
}

// STATE VARIABLES =============================================================

// The pen: this holds the state of the pen at the "latest tip" of the buffer,
// meaning that as soon as an instruction intended to be run in the buffer is
// received, this is updated to reflect the intention of the buffered item.
cncserver.pen = {
  x: null, // XY to be set by bot defined park position (assumed initial location)
  y: null,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  height: 0, // Last set pen height in output servo value
  power: 0,
  busy: false,
  tool: 'color0',
  offCanvas: false,
  lastDuration: 0, // Holds the last movement timing in milliseconds
  distanceCounter: 0, // Holds a running tally of distance travelled
  simulation: 0 // Fake everything and act like it's working, no serial
};

// actualPen: This is set to the state of the pen variable as it passes through
// the buffer queue and into the robot, meant to reflect the actual position and
// state of the robot, and will be where the pen object is reset to when the
// buffer is cleared and the future state is lost.
cncserver.actualPen = extend({}, cncserver.pen);

// Global Defaults (also used to write the initial config.ini)
var globalConfigDefaults = {
  httpPort: 4242,
  httpLocalOnly: true,
  swapMotors: false, // Global setting for bots that don't have it configured
  invertAxis: {
    x: false,
    y: false
  },
  serialPath: "{auto}", // Empty for auto-config
  bufferLatencyOffset: 30, // Number of ms to move each command closer together
  corsDomain: '*', // Start as open to CORs enabled browser clients
  debug: false,
  botType: 'watercolorbot',
  scratchSupport: true,
  flipZToggleBit: false,
  botOverride: {
    info: "Override bot specific settings like > [botOverride.eggbot] servo:max = 1234"
  }
};

// INTIAL SETUP ================================================================

// Global express initialization (must run before any endpoint creation)
app.configure(function(){
  app.use("/", express.static(__dirname + '/example'));
  app.use(express.bodyParser());
});

// Various serial initialization variables
var serialport = require("serialport");
var serialPort = false;
var SerialPort = serialport.SerialPort;

// Buffer State variables
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;
var bufferNewlyPaused = false; // Trigger for pause callback on executeNext()
var bufferPauseCallback = null;
var bufferPausePen = null; // Hold the state when paused initiated for resuming

// Load the Global Configuration (from config, defaults & CL vars)
loadGlobalConfig(standaloneOrModuleInit);

// Only if we're running standalone... try to start the server immediately!
function standaloneOrModuleInit() {
  if (!module.parent) {
    // Load the bot specific configuration, defaulting to gConf bot type
    loadBotConfig(function(){
      // Attempt Initial Serial Connection
      connectSerial({
        error: function() {
          console.error('CONNECTSERIAL ERROR!');
          simulationModeInit();
          serialPortReadyCallback();
        },
        connect: function(){
          //console.log('CONNECTSERIAL CONNECT!');
          serialPortReadyCallback();
        },
        disconnect: serialPortCloseCallback
      });
    });

  } else { // Export the module's useful API functions! ========================
    // Connect to serial and start server
    exports.start = function(options) {
      // Add low-level short-circuit to avoid Socket.IO overhead
      if (typeof options.bufferUpdate === 'function') {
        exports.bufferUpdateTrigger = options.bufferUpdate;
      }

      if (typeof options.penUpdate === 'function') {
        exports.penUpdateTrigger = options.penUpdate;
      }

      loadBotConfig(function(){
        connectSerial({
          success: function() { // Successfully connected
            if (options.success) options.success();
          },
          error: function(info) { // Error during connection attempt
            if (options.error) options.error(info);
          },
          connect: function() { // Callback for first serial connect, or re-connect
            serialPortReadyCallback();
            if (options.connect) options.connect();
          },
          disconnect: function() { // Callback for serial disconnect
            serialPortCloseCallback();
            if (options.disconnect) options.disconnect();
          }
        });
      }, options.botType);
    };

    // Retreieve list of bot configs
    exports.getSupportedBots = function() {
      var ini = require('ini');
      var list = fs.readdirSync(path.resolve(__dirname, 'machine_types'));
      var out = {};
      for(var i in list) {
        var data = ini.parse(fs.readFileSync(path.resolve(__dirname, 'machine_types', list[i]), 'utf-8'));
        var type = list[i].split('.')[0];
        out[type] = {
          name: data.name,
          data: data
        };
      }
      return out;
    };

    // Direct configuration access (use the getters and override setters!)
    exports.conf = {
      bot: cncserver.botConf,
      global: cncserver.gConf
    };

    // Export to reset global config
    exports.loadGlobalConfig = loadGlobalConfig;

    // Export to reset or load different bot config
    exports.loadBotConfig = loadBotConfig;

    // Continue with simulation mode
    exports.continueSimulation = simulationModeInit;

    // Export Serial Ready Init (starts webserver)
    exports.serialReadyInit = serialPortReadyCallback;

    // Get available serial ports
    exports.getPorts = function(cb) {
      require("serialport").list(function (err, ports) {
        cb(ports);
      });
    };
  }
}

// Grouping function to send off the initial configuration for the bot
function sendBotConfig() {
  // EBB Specific Config =================================
  if (cncserver.botConf.get('controller').name === 'EiBotBoard') {
    console.log('Sending EBB config...');
    run('custom', 'EM,' + cncserver.botConf.get('speed:precision'));

    // Send twice for good measure
    run('custom', 'SC,10,' + cncserver.botConf.get('servo:rate'));
    run('custom', 'SC,10,' + cncserver.botConf.get('servo:rate'));
  }

  var isVirtual = cncserver.pen.simulation ? ' (simulated)' : '';
  console.info('---=== ' + cncserver.botConf.get('name') + isVirtual + ' is ready to receive commands ===---');
}

// Start express HTTP server for API on the given port
var serverStarted = false;
function startServer() {
  // Only run start server once...
  if (serverStarted) return;
  serverStarted = true;

  var hostname = cncserver.gConf.get('httpLocalOnly') ? 'localhost' : null;

  // Catch Addr in Use Error
  server.on('error', function (e) {
    if (e.code === 'EADDRINUSE') {
      console.log('Address in use, retrying...');
      setTimeout(function () {
        closeServer();
        server.listen(cncserver.gConf.get('httpPort'), hostname);
      }, 1000);
    }
  });

  server.listen(cncserver.gConf.get('httpPort'), hostname, function(){
    // Properly close down server on fail/close
    process.on('uncaughtException', function(err){ console.log(err); closeServer(); });
    process.on('SIGTERM', function(err){ console.log(err); closeServer(); });
  });
}

function closeServer() {
  try {
    server.close();
  } catch(e) {
    console.log("Whoops, server wasn't running.. Oh well.");
  }
}

// No events are bound till we have attempted a serial connection
function serialPortReadyCallback() {

  console.log('CNC server API listening on ' +
    (cncserver.gConf.get('httpLocalOnly') ? 'localhost' : '*') +
    ':' + cncserver.gConf.get('httpPort')
  );

  // Is the serialport ready? Start reading
  if (!cncserver.pen.simulation) {
    serialPort.on("data", serialReadline);
  }

  sendBotConfig();
  startServer();

  // Scratch v2 endpoint & API =================================================
  if (cncserver.gConf.get('scratchSupport')) {
    scratch.initAPI(cncserver);
  }

  // CNC Server API ============================================================
  // Return/Set CNCServer Configuration ========================================
  cncserver.createServerEndpoint("/v1/settings", function(req, res){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body: {
        global: '/v1/settings/global',
        bot: '/v1/settings/bot'
      }};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/settings/:type", function(req, res){
    // Sanity check type
    var setType = req.params.type;
    if (setType !== 'global' && setType !== 'bot'){
      return [404, 'Settings group not found'];
    }

    var conf = setType === 'global' ? cncserver.gConf : cncserver.botConf;

    function getSettings() {
      var out = {};
      // Clean the output for global as it contains all commandline env vars!
      if (setType === 'global') {
        var g = conf.get();
        for (var i in g) {
          if (i === "botOverride") {
            break;
          }
          out[i] = g[i];
        }
      } else {
        out = conf.get();
      }
      return out;
    }

    // Get the full list for the type
    if (req.route.method === 'get') {
      return {code: 200, body: getSettings()};
    } else if (req.route.method === 'put') {
      for (var i in req.body) {
        conf.set(i, req.body[i]);
      }
      return {code: 200, body: getSettings()};
    } else {
      return false;
    }
  });

  // Return/Set PEN state  API =================================================
  cncserver.createServerEndpoint("/v1/pen", function(req, res){
    if (req.route.method === 'put') {
      // SET/UPDATE pen status
      setPen(req.body, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: "Error setting pen!"
          }));
        } else {
          if (req.body.ignoreTimeout){
            res.status(202).send(JSON.stringify(cncserver.pen));
          }
          res.status(200).send(JSON.stringify(cncserver.pen));
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method === 'delete'){
      // Reset pen to defaults (park)
      setHeight('up', function(){
        setPen({
          x: cncserver.bot.park.x,
          y: cncserver.bot.park.y,
          park: true,
          skipBuffer: req.body.skipBuffer
        }, function(stat){
          if (!stat) {
            res.status(500).send(JSON.stringify({
              status: "Error parking pen!"
            }));
          }
          res.status(200).send(JSON.stringify(cncserver.pen));
        });
      }, req.body.skipBuffer);

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method === 'get'){
      if (req.query.actual) {
        return {code: 200, body: cncserver.actualPen};
      } else {
        return {code: 200, body: cncserver.pen};
      }
    } else  {
      return false;
    }
  });

  // Return/Set Motor state API ================================================
  cncserver.createServerEndpoint("/v1/motors", function(req, res){
    // Disable/unlock motors
    if (req.route.method === 'delete') {
      run('custom', 'EM,0,0');
      return [201, 'Disable Queued'];
    } else if (req.route.method === 'put') {
      if (req.body.reset === 1) {
        // ZERO motor position to park position
        var park = centToSteps(cncserver.bot.park, true);
        // It is at this point assumed that one would *never* want to do this as
        // a buffered operation as it implies *manually* moving the bot to the
        // parking location, so we're going to man-handle the variables a bit.
        // completely not repecting the buffer (as really, it should be empty)

        // As a precaution, here's some insurance
        if (buffer.length && bufferRunning) {
          return [406, 'Can not Zero while running. Pause or clear buffer.'];
        }

        // Set tip of buffer to current
        cncserver.pen.x = park.x;
        cncserver.pen.y = park.y;

        // Set actualPen position. This is the ONLY place we set this value
        // without a movement, because it's assumed to have been moved there
        // physically by a user. Also we're assuming they did it instantly!
        cncserver.actualPen.x = park.x;
        cncserver.actualPen.y = park.y;
        cncserver.actualPen.lastDuration = 0;

        sendPenUpdate();
        console.log('Motor offset reset to park position');
        return [200, 'Motor offset reset to park position'];
      } else {
        return [406, 'Input not acceptable, see API spec for details.'];
      }
    } else {
      return false;
    }
  });

  // Command buffer API ========================================================
  cncserver.createServerEndpoint("/v1/buffer", function(req, res){
    if (req.route.method === 'get' || req.route.method === 'put') {
      // Pause/resume (normalize input)
      if (typeof req.body.paused === "string") {
        req.body.paused = req.body.paused === "true" ? true : false;
      }

      if (typeof req.body.paused === "boolean") {
        if (req.body.paused != bufferPaused) {
          bufferPaused = req.body.paused;
          console.log('Run buffer ' + (bufferPaused ? 'paused!': 'resumed!'));
          bufferRunning = false; // Force a followup check as the paused var has changed

          bufferNewlyPaused = bufferPaused; // Changed to paused!
          sendBufferVars();

          // Hold on the current actualPen to return to before resuming
          if (bufferPaused) {
            bufferPausePen = extend({}, cncserver.actualPen);
            sendBufferVars();
            setHeight('up', null, true); // Pen up for safety!
          }
        }
      }

      // Did we actually change position since pausing?
      var changedSincePause = false;
      if (bufferPausePen) {
        if (bufferPausePen.x != cncserver.actualPen.x ||
            bufferPausePen.y != cncserver.actualPen.y ||
            bufferPausePen.height != cncserver.actualPen.height){
          changedSincePause = true;
        } else {
          // If we're resuming, and there's no change... clear the pause pen
          if (!bufferPaused) {
            bufferPausePen = null;
            sendBufferVars();
          }
        }
      }

      // Resuming? Move back to position we paused at (if changed)
      if (!bufferPaused && changedSincePause) {
        bufferPaused = true; // Pause for a bit until we move back to last pos
        sendBufferVars();
        console.log('Moving back to pre-pause position...');

        // Set the pen up before moving to resume position
        setHeight('up', function(){
          actuallyMove(bufferPausePen, function(){
            // Set the height back to what it was AFTER moving
            actuallyMoveHeight(bufferPausePen.height, bufferPausePen.state, function(){
              console.log('Resuming buffer!');
              bufferPaused = false;
              bufferPausePen = null;
              sendBufferVars();
              res.status(200).send(JSON.stringify({
                running: bufferRunning,
                paused: bufferPaused,
                count: buffer.length,
                buffer: buffer
              }));
            });
          });
        }, true); // Skipbuffer on setheight!

        return true; // Don't finish the response till after move back ^^^
      }


      if (!bufferNewlyPaused || buffer.length === 0) {
        bufferNewlyPaused = false; // In case paused with 0 items in buffer
        sendBufferVars();
        return {code: 200, body: {
          running: bufferRunning,
          paused: bufferPaused,
          count: buffer.length
        }};
      } else { // Buffer isn't empty and we're newly paused
        // Wait until last item has finished before returning
        console.log('Waiting for last item to finish...');

        bufferPauseCallback = function(){
          res.status(200).send(JSON.stringify({
            running: bufferRunning,
            paused: bufferPaused,
            count: buffer.length
          }));
          sendBufferVars();
          bufferNewlyPaused = false;
        };

        return true; // Don't finish the response till later
      }
    } else if (req.route.method === 'post') {
      // Create a status message/callback and shuck it into the buffer
      if (typeof req.body.message === "string") {
        run('message', req.body.message);
        return [200, 'Message added to buffer'];
      } else if (typeof req.body.callback === "string") {
        run('callbackname', req.body.callback);
        return [200, 'Callback name added to buffer'];
      } else {
        return [400, '/v1/buffer POST only accepts data "message" or "callback"'];
      }
    } else if (req.route.method === 'delete') {
      cncserver.clearBuffer();
      bufferRunning = false;

      bufferPausePen = null; // Resuming with an empty buffer is silly
      bufferPaused = false;

      sendBufferComplete(); // SHould be fine to send as buffer is empty.

      console.log('Run buffer cleared!');
      return [200, 'Buffer Cleared'];
    } else {
      return false;
    }
  });

  // Get/Change Tool API =======================================================
  cncserver.createServerEndpoint("/v1/tools", function(req, res){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body:{tools: Object.keys(cncserver.botConf.get('tools'))}};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/tools/:tool", function(req, res){
    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method === 'put') { // Set Tool
      if (cncserver.botConf.get('tools:' + toolName)){
        setTool(toolName, function(data){
          cncserver.pen.tool = toolName;
          res.status(200).send(JSON.stringify({
            status: 'Tool changed to ' + toolName
          }));
        }, req.body.ignoreTimeout);
        return true; // Tell endpoint wrapper we'll handle the response
      } else {
        return [404, "Tool: '" + toolName + "' not found"];
      }
    } else {
      return false;
    }
  });

  // ===========================================================================
  // UTILITY FUNCTIONS =========================================================
  // ===========================================================================

  /**
   * Run to the buffer direct low level setup commands (for EiBotBoard only).
   *
   * @param {integer} id
   *   Numeric ID of EBB setting to change the value of
   * @param {integer} value
   *   Value to set to
   */
  exports.sendSetup = sendSetup;
  function sendSetup(id, value) {
    // TODO: Make this WCB specific, or refactor to be general
    run('custom', 'SC,' + id + ',' + value);
  }

  /**
   * General logic sorting function for most "pen" requests.
   *
   * @param {object} inPen
   *   Raw object containing data from /v1/pen PUT requests. See API spec for
   *   pen to get an idea of what can live in this object.
   * @param callback
   *   Callback triggered when intended action should be complete.
   */
  exports.setPen = setPen;
  cncserver.setPen = setPen;
  function setPen(inPen, callback) {
    // Force the distanceCounter to be a number (was coming up as null)
    cncserver.pen.distanceCounter = parseInt(cncserver.pen.distanceCounter);

    // Counter Reset
    if (inPen.resetCounter) {
      cncserver.pen.distanceCounter = Number(0);
      callback(true);
      return;
    }

    // Setting the value of the power to the pen
    if (typeof inPen.power !== "undefined") {
      var powers = botConf.get('penpower');
      if(typeof powers === "undefined") { // We have no super powers
        powers = {min: 0, max: 0};  // Set the powers to zero
      }

      run('custom', cmdstr('penpower', {p: Math.round(inPen.power * powers.max) + Number(powers.min)}));
      pen.power = inPen.power;
      if (callback) callback(true);
      return;
    }

    // Setting the value of simulation
    if (typeof inPen.simulation != "undefined") {

      // No change
      if (inPen.simulation === cncserver.pen.simulation) {
        callback(true);
        return;
      }

      if (inPen.simulation === 0) { // Attempt to connect to serial
        connectSerial({complete: callback});
      } else {  // Turn off serial!
        // TODO: Actually nullify connection.. no use case worth it yet
        simulationModeInit();
      }

      return;
    }


    // State/z position has been passed
    if (typeof inPen.state != "undefined") {
      // Disallow actual cncserver.pen setting when off canvas (unless skipping buffer)
      if (!cncserver.pen.offCanvas || inPen.skipBuffer) {
        setHeight(inPen.state, callback, inPen.skipBuffer);
      } else {
        // Save the state anyways so we can come back to it
        cncserver.pen.state = inPen.state;
        if (callback) callback(1);
      }
      return;
    }

    // Absolute positions are set
    if (inPen.x !== undefined){
      // Input values are given as percentages of working area (not max area)

      // Don't accept bad input
      if (isNaN(inPen.x) || isNaN(inPen.y) || !isFinite(inPen.x) || !isFinite(inPen.y)) {
        callback(false);
        return;
      }

      // Convert the percentage values into real absolute and appropriate values
      var absInput = centToSteps(inPen);
      absInput.limit = 'workArea';

      // Are we parking?
      if (inPen.park) {
        // Don't repark if already parked (but not if we're skipping the buffer)
        var park = centToSteps(cncserver.bot.park, true);
        if (cncserver.pen.x === park.x && cncserver.pen.y === park.y && !inPen.skipBuffer) {
          if (callback) callback(false);
          return;
        }

        // Set Absolute input value to park position in steps
        absInput.x = park.x;
        absInput.y = park.y;
        absInput.limit = 'maxArea';
      }

      // Sanity check and format ignoreTimeout as clean triple equals boolean.
      if (typeof inPen.ignoreTimeout !== 'undefined') {
        inPen.ignoreTimeout = parseInt(inPen.ignoreTimeout) === 1 ? true : false;
      }

      // Adjust the distance counter based on movement amount
      var distance = movePenAbs(absInput, callback, inPen.ignoreTimeout, inPen.skipBuffer);
      if (cncserver.pen.state === 'draw' || cncserver.pen.state === 1) {
        cncserver.pen.distanceCounter = parseInt(Number(distance) + Number(cncserver.pen.distanceCounter));
      }
      return;
    }

    if (callback) callback(cncserver.pen);
  }


  /**
   * Run a servo position from a given percentage or named height value into
   * the buffer, or directly via skipBuffer.
   *
   * @param {number|string} state
   *   Named height preset machine name, or float between 0 & 1.
   * @param callback
   *   Callback triggered when operation should be complete.
   * @param skipBuffer
   *   Set to true to skip adding the command to the buffer and run it
   *   immediately.
   */
  exports.setHeight = setHeight;
  cncserver.setHeight = setHeight;
  function setHeight(state, callback, skipBuffer) {
    var stateValue = null; // Placeholder for what to normalize the pen state to
    var height = 0; // Placeholder for servo height value
    var servoDuration = cncserver.botConf.get('servo:duration');

    // Convert the incoming state
    var conv = stateToHeight(state);
      height = conv.height;
      stateValue = conv.state;

    // If we're skipping the buffer, just set the height directly
    if (skipBuffer) {
      console.log('Skipping buffer to set height:', height);
      actuallyMoveHeight(height, stateValue, callback);
      return;
    }

    // Pro-rate the duration depending on amount of change from current to tip of buffer
    if (cncserver.pen.height) {
      var range = parseInt(cncserver.botConf.get('servo:max')) - parseInt(cncserver.botConf.get('servo:min'));
      servoDuration = Math.round((Math.abs(height - cncserver.pen.height) / range) * servoDuration)+1;
    }

    // Actually set tip of buffer to given sanitized state & servo height.
    cncserver.pen.height = height;
    cncserver.pen.state = stateValue;

    // Run the height into the command buffer
    run('height', height, servoDuration);

    // Height movement callback servo movement duration offset
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(servoDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
    }
  }

  /**
   * Perform conversion from named/0-1 number state value to given pen height
   * suitable for outputting to a Z axis control statement.
   *
   * @param state
   * @returns {object}
   *   Object containing normalized state, and numeric height value. As:
   *   {state: [integer|string], height: [float]}
   */
  cncserver.stateToHeight = stateToHeight;
  function stateToHeight(state) {
    // Whether to use the full min/max range (used for named presets only)
    var fullRange = false;
    var min = parseInt(cncserver.botConf.get('servo:min'));
    var max = parseInt(cncserver.botConf.get('servo:max'));
    var range = max - min;
    var normalizedState = state; // Normalize/sanitize the incoming state

    var presets = cncserver.botConf.get('servo:presets');
    var height = 0; // Placeholder for height output

    // Validate Height, and conform to a bottom to top based percentage 0 to 100
    if (isNaN(parseInt(state))){ // Textual position!
      if (presets[state]) {
        height = parseFloat(presets[state]);
      } else { // Textual expression not found, default to UP
        height = presets.up;
        normalizedState = 'up';
      }

      fullRange = true;
    } else { // Numerical position (0 to 1), moves between up (0) and draw (1)
      height = Math.abs(parseFloat(state));
      height = height > 1 ?  1 : height; // Limit to 1
      normalizedState = height;

      // Reverse value and lock to 0 to 100 percentage with 1 decimal place
      height = parseInt((1 - height) * 1000) / 10;
    }

    // Lower the range when using 0 to 1 values to between up and draw
    if (!fullRange) {
      min = ((presets.draw / 100) * range) + min;
      max = ((presets.up / 100) * range) + parseInt(cncserver.botConf.get('servo:min'));

      range = max - min;
    }

    // Sanity check incoming height value to 0 to 100
    height = height > 100 ? 100 : height;
    height = height < 0 ? 0 : height;

    // Calculate the final servo value from percentage
    height = Math.round(((height / 100) * range) + min);
    return {height: height, state: normalizedState};
  }


  /**
   * Run the operation to set the current tool (and any aggregate operations
   * required) into the buffer
   *
   * @param toolName
   *   The machine name of the tool (as defined in the bot config file).
   * @param callback
   *   Triggered when the full tool change is to have been completed, or on
   *   failure.
   * @returns {boolean}
   *   True if success, false if failuer
   */
  exports.setTool = setTool;
  cncserver.setTool = setTool;
  function setTool(toolName, callback, ignoreTimeout) {
    var tool = cncserver.botConf.get('tools:' + toolName);

    // No tool found with that name? Augh! Run AWAY!
    if (!tool) {
      if (callback) run('callback', callback);
      return false;
    }

    console.log('Changing to tool: ' + toolName);

    // Set the height based on what kind of tool it is
    // TODO: fold this into bot specific tool change logic
    var downHeight = toolName.indexOf('water') !== -1 ? 'wash' : 'draw';

    // Pen Up
    setHeight('up');

    // Move to the tool
    movePenAbs(tool);

    // "wait" tools need user feedback to let cncserver know that it can continue
    if (typeof tool.wait !== "undefined") {

      if (callback){
        run('callback', callback);
      }

      // Pause or resume continued execution based on tool.wait value
      // In theory: a wait tool has a complementary resume tool to bring it back
      if (tool.wait) {
        bufferPaused = true;
      } else {
        bufferPaused = false;
        executeNext();
      }

      sendBufferVars();
    } else { // "Standard" WaterColorBot toolchange

      // Pen down
      setHeight(downHeight);

      // Wiggle the brush a bit
      wigglePen(tool.wiggleAxis, tool.wiggleTravel, tool.wiggleIterations);

      // Put the pen back up when done!
      setHeight('up');

      // If there's a callback to run...
      if (callback){
        if (!ignoreTimeout) { // Run inside the buffer
          run('callback', callback);
        } else { // Run as soon as items have been buffered
          callback(1);
        }
      }
      return true;
    }
  }

  /**
   * "Move" the pen (tip of the buffer) to an absolute point inside the maximum
   * available bot area. Includes cutoffs and sanity checks.
   *
   * @param {{x: number, y: number, [limit: string]}} inPoint
   *   Absolute coordinate measured in steps to move to. src is assumed to be
   *   "pen" tip of buffer. Also can contain optional "limit" key to set where
   *   movement should be limited to. Defaults to none, accepts "workArea".
   * @param {function} callback
   *   Callback triggered when operation should be complete.
   * @param {boolean} immediate
   *   Set to true to trigger the callback immediately.
   * @param {boolean} skipBuffer
   *    Set to true to skip adding to the buffer, simplifying this function
   *    down to just a sanity checker.
   * @returns {number}
   *   Distance moved from previous position, in steps.
   */
  cncserver.movePenAbs = movePenAbs;
  function movePenAbs(inPoint, callback, immediate, skipBuffer) {
    // Something really bad happened here...
    if (isNaN(inPoint.x) || isNaN(inPoint.y)){
      console.error('INVALID Move pen input, given:', inPoint);
      if (callback) callback(false);
      return 0;
    }

    // Make a local copy of point as we don't want to mess with its values ByRef
    var point = extend({}, inPoint);

    // Sanity check absolute position input point and round everything (as we
    // only move in whole number steps)
    point.x = Math.round(Number(point.x));
    point.y = Math.round(Number(point.y));

    // If moving in the workArea only, limit to allowed workArea, and trigger
    // on/off screen events when we go offscreen, retaining suggested position.
    var startOffCanvasChange = false;
    if (point.limit === 'workArea') {
      // Off the Right
      if (point.x > cncserver.bot.workArea.right) {
        point.x = cncserver.bot.workArea.right;
        startOffCanvasChange = true;
      }

      // Off the Left
      if (point.x < cncserver.bot.workArea.left) {
        point.x = cncserver.bot.workArea.left;
        startOffCanvasChange = true;
      }

      // Off the Top
      if (point.y < cncserver.bot.workArea.top) {
        point.y = cncserver.bot.workArea.top;
        startOffCanvasChange = true;
      }

      // Off the Bottom
      if (point.y > cncserver.bot.workArea.bottom) {
        point.y = cncserver.bot.workArea.bottom;
        startOffCanvasChange = true;
      }

      // Are we beyond our workarea limits?
      if (startOffCanvasChange) { // Yep.
        // We MUST trigger the start offscreen change AFTER the movement to draw
        // up to that point (which happens later).
      } else { // Nope!
        // The off canvas STOP trigger must happen BEFORE the move happens
        // (which is fine right here)
        offCanvasChange(false);
      }
    }

    sanityCheckAbsoluteCoord(point); // Ensure values don't go off the rails

    // If we're skipping the buffer, just move to the point
    // Pen stays put as last point set in buffer
    if (skipBuffer) {
      console.log('Skipping buffer for:', point);
      actuallyMove(point, callback);
      return 0; // Don't return any distance for buffer skipped movements
    }

    // Calculate change from end of buffer pen position
    var change = {
      x: Math.round(point.x - cncserver.pen.x),
      y: Math.round(point.y - cncserver.pen.y)
    };

    // Don't do anything if there's no change
    if (change.x === 0 && change.y === 0) {
      if (callback) callback(cncserver.pen);
      return 0;
    }

    /*
     Duration/distance is only calculated as relative from last assumed point,
     which may not actually ever happen, though it is likely to happen.
     Buffered items may not be pushed out of order, but previous location may
     have changed as user might pause the buffer, and move the actualPen
     position.
     @see executeNext - for more details on how this is handled.
    */
    var distance = getVectorLength(change);
    var duration = getDurationFromDistance(distance);



    // Only if we actually moved anywhere should we queue a movement
    if (distance !== 0) {
      // Set the tip of buffer pen at new position
      cncserver.pen.x = point.x;
      cncserver.pen.y = point.y;

      // Queue the final absolute move (serial command generated later)
      run('move', {x: cncserver.pen.x, y: cncserver.pen.y}, duration);
    }

    // Required start offCanvas change -after- movement has been queued
    if (startOffCanvasChange) {
      offCanvasChange(true);
    }

    if (callback) {
      if (immediate === true) {
        callback(cncserver.pen);
      } else {
        // Set the timeout to occur sooner so the next command will execute
        // before the other is actually complete. This will push into the buffer
        // and allow for far smoother move runs.

        var cmdDuration = Math.max(duration - cncserver.gConf.get('bufferLatencyOffset'), 0);

        if (cmdDuration < 2) {
          callback(cncserver.pen);
        } else {
          setTimeout(function(){callback(cncserver.pen);}, cmdDuration);
        }

      }
    }

    return distance;
  }

  /**
   * Util function to buffer the "wiggle" movement for WaterColorBot Tool
   * changes. TODO: Replace this with a real API for tool changes.
   *
   * @param {string} axis
   *   Which axis to move along. Either 'xy' or 'y'
   * @param travel
   *   How much to move during the wiggle.
   * @param iterations
   *   How many times to move.
   */
  function wigglePen(axis, travel, iterations){
    var start = {x: Number(cncserver.pen.x), y: Number(cncserver.pen.y)};
    var i = 0;
    travel = Number(travel); // Make sure it's not a string

    // Start the wiggle!
    _wiggleSlave(true);

    function _wiggleSlave(toggle){
      var point = {x: start.x, y: start.y};

      if (axis === 'xy') {
        var rot = i % 4; // Ensure rot is always 0-3

        // This convoluted series ensure the wiggle moves in a proper diamond
        if (rot % 3) { // Results in F, T, T, F
          if (toggle) {
            point.y+= travel/2; // Down
          } else {
            point.x-= travel; // Left
          }
        } else {
           if (toggle) {
             point.y-= travel/2; // Up
           } else {
             point.x+= travel; // Right
           }
        }
      } else {
        point[axis]+= (toggle ? travel : travel * -1);
      }

      movePenAbs(point);

      i++;

      if (i <= iterations){ // Wiggle again!
        _wiggleSlave(!toggle);
      } else { // Done wiggling, go back to start
        movePenAbs(start);
      }
    }
  }
}


/**
 * Helper function for clearing the buffer. Used mainly by plugins.
 *
 */
cncserver.clearBuffer = function() {
  buffer = [];

  // Reset the state of the buffer tip pen to the state of the actual robot.
  // If this isn't done, it will be assumed to be a state that was deleted
  // and never sent out.
  cncserver.pen = extend({}, cncserver.actualPen);

};

/**
 * Triggered when the pen is requested to move across the bounds of the draw
 * area (either in or out).
 *
 * @param {boolean} newValue
 *   Pass true when moving "off screen", false when moving back into bounds
 */
function offCanvasChange(newValue) {
  if (cncserver.pen.offCanvas !== newValue) { // Only do anything if the value is different
    cncserver.pen.offCanvas = newValue;
    if (cncserver.pen.offCanvas) { // Pen is now off screen/out of bounds
      if (cncserver.pen.state === 'draw' || cncserver.pen.state === 1) {
        // Don't draw stuff while out of bounds (also, don't change the current
        // known state so we can come back to it when we return to bounds),
        // but DO change the buffer tip height so that is reflected on actualPen
        // if it's every copied over on buffer execution.
        cncserver.pen.height = cncserver.stateToHeight('up').height;
        run('callback', function() {
          exports.setHeight('up', false, true);
        });
      }
    } else { // Pen is now back in bounds
      // Set the state regardless of actual change
      var back = cncserver.pen.state;
      console.log('Go back to:', back);

      // Assume starting from up state & height (ensures correct timing)
      cncserver.pen.state = "up";
      cncserver.pen.height = cncserver.stateToHeight('up').height;
      exports.setHeight(back);
    }
  }
}

function sanityCheckAbsoluteCoord(point) {
  point.x = point.x > cncserver.bot.maxArea.width ? cncserver.bot.maxArea.width : point.x;
  point.y = point.y > cncserver.bot.maxArea.height ? cncserver.bot.maxArea.height : point.y;
  point.x = point.x < 0 ? 0 : point.x;
  point.y = point.y < 0 ? 0 : point.y;
}

/**
 * Convert percent of total area coordinates into absolute step coordinate
 * values
 * @param {{x: number, y: number}} point
 *   Coordinate (measured in steps) to be converted.
 * @param {boolean} inMaxArea
 *   Pass "true" if percent values should be considered within the maximum area
 *   otherwise steps will be calculated as part of the global work area.
 * @returns {{x: number, y: number}}
 *   Converted coordinate in steps.
 */
cncserver.centToSteps = centToSteps;
function centToSteps(point, inMaxArea) {
  if (!inMaxArea) { // Calculate based on workArea
    return {
      x: cncserver.bot.workArea.left + ((point.x / 100) * cncserver.bot.workArea.width),
      y: cncserver.bot.workArea.top + ((point.y / 100) * cncserver.bot.workArea.height)
    };
  } else { // Calculate based on ALL area
    return {
      x: (point.x / 100) * cncserver.bot.maxArea.width,
      y: (point.y / 100) * cncserver.bot.maxArea.height
    };
  }
}

/**
 * Initialize/load the global cncserver configuration file & options.
 *
 * @param cb
 *   Optional callback triggered when complete.
 */
function loadGlobalConfig(cb) {
  // Pull conf from file
  var configPath = path.resolve(__dirname, 'config.ini');
  cncserver.gConf.reset();
  cncserver.gConf.use('file', {
    file: configPath,
    format: nconf.formats.ini
  }).load(function (){
    // Set Global Config Defaults
    cncserver.gConf.defaults(globalConfigDefaults);

    // Save Global Conf file defaults if not saved
    if(!fs.existsSync(configPath)) {
      var def = cncserver.gConf.stores.defaults.store;
      for(var key in def) {
        if (key !== 'type'){
          cncserver.gConf.set(key, def[key]);
        }
      }

      // Should be sync/blocking save with no callback
      cncserver.gConf.save();
    }

    if (cb) cb(); // Trigger the callback

    // Output if debug mode is on
    if (cncserver.gConf.get('debug')) {
      console.info('== CNCServer Debug mode is ON ==');
    }
  });
}

/**
 * Load bot specific config file
 *
 * @param {function} cb
 *   Callback triggered when loading is complete
 * @param {string} botType
 *   Optional, the machine name for the bot type to load. Defaults to
 *   the globally configured bot type.
 */
function loadBotConfig(cb, botType) {
  if (!botType) botType = cncserver.gConf.get('botType');

  var botTypeFile = path.resolve(__dirname, 'machine_types', botType + '.ini');
  if (!fs.existsSync(botTypeFile)){
    console.error('Bot configuration file "' + botTypeFile + '" doesn\'t exist. Error #16');
    process.exit(16);
  } else {
    cncserver.botConf.reset();
    cncserver.botConf.use('file', {
      file: botTypeFile,
      format: nconf.formats.ini
    }).load(function(){

      // Mesh in bot overrides from main config
      var overrides = cncserver.gConf.get('botOverride');
      if (overrides) {
        if (overrides[botType]) {
          for(var key in overrides[botType]) {
            cncserver.botConf.set(key, overrides[botType][key]);
          }
        }
      }

      // Handy bot constant for easy number from string conversion
      cncserver.bot = {
        workArea: {
          left: Number(cncserver.botConf.get('workArea:left')),
          top: Number(cncserver.botConf.get('workArea:top')),
          right: Number(cncserver.botConf.get('maxArea:width')),
          bottom: Number(cncserver.botConf.get('maxArea:height'))
        },
        maxArea: {
          width: Number(cncserver.botConf.get('maxArea:width')),
          height: Number(cncserver.botConf.get('maxArea:height'))
        },
        park: {
          x: Number(cncserver.botConf.get('park:x')),
          y: Number(cncserver.botConf.get('park:y'))
        },
        commands : cncserver.botConf.get('controller').commands
      };

      // Store assumed constants
      cncserver.bot.workArea.width = cncserver.bot.maxArea.width - cncserver.bot.workArea.left;
      cncserver.bot.workArea.height = cncserver.bot.maxArea.height - cncserver.bot.workArea.top;

      cncserver.bot.workArea.relCenter = {
        x: cncserver.bot.workArea.width / 2,
        y: cncserver.bot.workArea.height / 2
      };

      cncserver.bot.workArea.absCenter = {
        x: cncserver.bot.workArea.relCenter.x + cncserver.bot.workArea.left,
        y: cncserver.bot.workArea.relCenter.y + cncserver.bot.workArea.top
      };


      // Set initial pen position at park position
      var park = centToSteps(cncserver.bot.park, true);
      cncserver.pen.x = park.x;
      cncserver.pen.y = park.y;

      // Set global override for swapMotors if set by bot config
      if (typeof cncserver.botConf.get('controller:swapMotors') !== 'undefined') {
        cncserver.gConf.set('swapMotors', cncserver.botConf.get('controller:swapMotors'));
      }

      console.log('Successfully loaded config for ' + cncserver.botConf.get('name') + '! Initializing...');

      // Trigger the callback once we're done
      if (cb) cb();
    });
  }
}

/**
 * Wrapper for unifying the creation and logic of standard endpoints, their
 * headers and their responses and formats.
 *
 * @param {string} path
 *   Full path of HTTP callback in express path format (can include wildcards)
 * @param {function} callback
 *   Callback triggered on HTTP request
 */
exports.createServerEndpoint = createServerEndpoint;
cncserver.createServerEndpoint = createServerEndpoint;
function createServerEndpoint(path, callback){
  var what = Object.prototype.toString;
  app.all(path, function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');
    res.set('Access-Control-Allow-Origin', cncserver.gConf.get('corsDomain'));

    if (cncserver.gConf.get('debug') && path !== '/poll') {
      console.log(req.route.method.toUpperCase(), req.route.path, JSON.stringify(req.body));
    }

    // Handle CORS Pre-flight OPTIONS request ourselves
    // TODO: Allow implementers to define options return data and allowed methods
    if (req.route.method === 'options') {
      res.set('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE');
      res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-Width, Content-Type, Accept');
      res.status(200).send();
      return;
    }

    var cbStat = callback(req, res);

    if (cbStat === false) { // Super simple "not supported"
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    } else if(what.call(cbStat) === '[object Array]') { // Simple return message
      // Array format: [/http code/, /status message/]
      res.status(cbStat[0]).send(JSON.stringify({
        status: cbStat[1]
      }));
    } else if(what.call(cbStat) === '[object Object]') { // Full message
      if (typeof cbStat.body === "string") { // Send plaintext if body is string
        res.set('Content-Type', 'text/plain; charset=UTF-8');
        res.status(cbStat.code).send(cbStat.body);
      } else {
        res.status(cbStat.code).send(JSON.stringify(cbStat.body));
      }

    }
  });
};

/**
 * Given two points, find the difference and duration at current speed between them
 *
 * @param {{x: number, y: number}} src
 *   Source position coordinate (in steps).
 * @param {{x: number, y: number}} dest
 *   Destination position coordinate (in steps).
 * @returns {{d: number, x: number, y: number}}
 *   Object containing the change amount in steps for x & y, along with the
 *   duration in milliseconds.
 */
function getPosChangeData(src, dest) {
   var change = {
    x: Math.round(dest.x - src.x),
    y: Math.round(dest.y - src.y)
  };

  // Calculate distance
  var duration = getDurationFromDistance(getVectorLength(change));

  // Adjust change direction/inversion
  if (cncserver.botConf.get('controller').position === "relative") {
    // Invert X or Y to match stepper direction
    change.x = cncserver.gConf.get('invertAxis:x') ? change.x * -1 : change.x;
    change.y = cncserver.gConf.get('invertAxis:y') ? change.y * -1 : change.y;
  } else { // Absolute! Just use the "new" absolute X & Y locations
    change.x = cncserver.pen.x;
    change.y = cncserver.pen.y;
  }

  // Swap motor positions
  if (cncserver.gConf.get('swapMotors')) {
    change = {
      x: change.y,
      y: change.x
    };
  }

  return {d: duration, x: change.x, y: change.y};
}

/**
 * Get the distance/length of the given vector coordinate
 *
 * @param {{x: number, y: number}} vector
 *   Object representing coordinate away from (0,0)
 * @returns {number}
 *   Length (in steps) of the given vector point
 */
function getVectorLength(vector) {
  return Math.sqrt( Math.pow(vector.x, 2) + Math.pow(vector.y, 2));
}

/**
 * Calculate the duration for a pen movement from the number of steps distance,
 * takes into account whether pen is up or down
 *
 * @param {float} distance
 *   Distance in steps that we'll be moving
 * @param {int} min
 *   Optional minimum value for output duration, defaults to 1.
 * @returns {number}
 *   Millisecond duration of how long the move should take
 */
function getDurationFromDistance(distance, min) {
  if (typeof min === "undefined") min = 1;

  var minSpeed = parseFloat(cncserver.botConf.get('speed:min'));
  var maxSpeed = parseFloat(cncserver.botConf.get('speed:max'));

  // Use given speed over distance to calculate duration
  var speed = (cncserver.actualPen.state === 'draw' || cncserver.actualPen.state === 1) ? cncserver.botConf.get('speed:drawing') : cncserver.botConf.get('speed:moving');
  speed = parseFloat(speed) / 100;
  speed = speed * (maxSpeed - minSpeed) + minSpeed); // Convert to steps from percentage

  // Sanity check speed value
  speed = speed > maxSpeed ? maxSpeed : speed;
  speed = speed < minSpeed ? minSpeed : speed;
  return Math.max(Math.abs(Math.round(distance / speed * 1000)), min); // How many steps a second?
}

/**
 * Actually move the position of the pen, called inside and outside buffer
 * runs, figures out timing/offset based on actualPen position.
 *
 * @param {{x: number, y: number}} destination
 *   Absolute destination coordinate position (in steps).
 * @param {function} callback
 *   Optional, callback for when operation should have completed.
 */
function actuallyMove(destination, callback) {
  // Get the amount of change/duration from difference between actualPen and
  // absolute position in given destination
  var change = getPosChangeData(cncserver.actualPen, destination);
  commandDuration = Math.max(change.d, 0);

  // Pass along the correct duration and new position through to actualPen
  cncserver.actualPen.lastDuration = change.d;
  cncserver.actualPen.x = destination.x;
  cncserver.actualPen.y = destination.y;

  // Trigger an update for pen position
  sendPenUpdate();

  serialCommand(cmdstr('movexy', change)); // Send the actual X, Y and Duration

  // Delayed callback (if used)
  if (callback) {
    setTimeout(function(){
      callback(1);
    }, Math.max(commandDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
  }
}

/**
 * Actually change the height of the pen, called inside and outside buffer
 * runs, figures out timing offset based on actualPen position.
 *
 * @param {integer} height
 *   Write-ready servo "height" value calculated from "state"
 * @param {string} stateValue
 *   Optional, pass what the name of the state should be saved as in the
 *   actualPen object when complete.
 * @param {function} callback
 *   Optional, callback for when operation should have completed.
 */
function actuallyMoveHeight(height, stateValue, callback) {
  var sd = cncserver.botConf.get('servo:duration');

  // Get the amount of change from difference between actualPen and absolute
  // height position, pro-rating the duration depending on amount of change
  if (cncserver.actualPen.height) {
    var range = parseInt(cncserver.botConf.get('servo:max')) - parseInt(cncserver.botConf.get('servo:min'));
    commandDuration = Math.round((Math.abs(height - cncserver.actualPen.height) / range) * sd) + 1;
  }

  // Pass along the correct height position through to actualPen
  if (typeof stateValue !== 'undefined') cncserver.actualPen.state = stateValue;
  cncserver.actualPen.height = height;
  cncserver.actualPen.lastDuration = commandDuration;

  // Trigger an update for pen position
  sendPenUpdate();

  // Set the pen up position (EBB)
  serialCommand(cmdstr('movez', {z: height}));

  // If there's a togglez, run it after setting Z
  if (cncserver.bot.commands.togglez) {
    serialCommand(cmdstr('togglez', {t: cncserver.gConf.get('flipZToggleBit') ? 1 : 0}));
  }

  // Force cncserver.bot to wait
  serialCommand(cmdstr('wait', {d: commandDuration}));

  // Delayed callback (if used)
  if (callback) {
    setTimeout(function(){
      callback(1);
    }, Math.max(commandDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
  }
}


// COMMAND RUN QUEUE UTILS =====================================================

// Holds the MS time of the "current" command sent, as this should be limited
// by the run queue, this should only ever refer to what's being sent through.
// the following command will be delayed by this much time.
var commandDuration = 0;


/**
 * Add a command to the command runner buffer.
 *
 * @param {string} command
 *   The
 * @param {object} data
 *
 * @param {int} duration
 *   The time in milliseconds this command should take to run
 *
 * @returns {boolean}
 *   Return false if failure, true if success
 */
cncserver.run = run;
function run(command, data, duration) {
  var c = '';

  // Sanity check duration to minimum of 1, int only
  duration = !duration ? 1 : Math.abs(parseInt(duration));
  duration = duration <= 0 ? 1 : duration;

  switch (command) {
    case 'move':
      // Detailed buffer object X and Y
      c = {type: 'absmove', x: data.x, y: data.y};
      break;
    case 'height':
      // Detailed buffer object with z height and state string
      c = {type: 'absheight', z: data, state: cncserver.pen.state};
      break;
    case 'message':
      // Detailed buffer object with a string message
      c = {type: 'message', message: data};
      break;
    case 'callbackname':
      // Detailed buffer object with a callback machine name
      c = {type: 'callbackname', name: data};
      break;
    case 'wait':
      // Send wait, blocking buffer
      if (!cncserver.bot.commands.wait) return false;
      c = cmdstr('wait', {d: duration});
      break;
    case 'custom':
      c = data;
      break;
    case 'callback': // Custom callback runner for API return triggering
      c = data;
      break;
    default:
      return false;
  }

  // Add final command and duration to end of queue, along with a copy of the
  // pen state at this point in time to be copied to actualPen after execution
  buffer.unshift([c, duration, extend({}, cncserver.pen)]);
  sendBufferAdd(buffer[0]);
  return true;
}

/**
 * Create a bot specific serial command string from a key:value object
 *
 * @param {string} name
 *   Key in cncserver.bot.commands object to find the command string
 * @param {object} values
 *   Object containing the keys of placeholders to find in command string, with
 *   value to replace placeholder
 * @returns {string}
 *   Serial command string intended to be outputted directly, empty string
 *   if error.
 */
function cmdstr(name, values) {
  if (!name || !cncserver.bot.commands[name]) return ''; // Sanity check

  var out = cncserver.bot.commands[name];

  for(var v in values) {
    out = out.replace('%' + v, values[v]);
  }

  return out;
}

/**
 * Execute the next command in the buffer, triggered by self, buffer interval
 * catcher loop below, and serialReadLine.
 *
 * @see serialReadLine
 */
function executeNext() {
  // Run the paused callback if applicable
  if (bufferNewlyPaused) {
    bufferPauseCallback();
  }

  // Don't continue execution if paused
  if (bufferPaused) return;

  if (buffer.length) {
    var cmd = buffer.pop();

    // Process a single line of the buffer =====================================
    // =========================================================================

    if (typeof cmd[0] === "function") { // Custom Callback buffer item
      // Timing for this should be correct because of commandDuration below!
      cmd[0](1);
      // Set the actualPen state to match the state assumed at the time the
      // buffer item was created
      cncserver.actualPen = extend({}, cmd[2]);

      // Trigger an update for buffer loss and actualPen change
      sendPenUpdate();
      executeNext();
    } else if (typeof cmd[0] === "object") { // Detailed buffer object

      // Actually send off the command to do something
      switch (cmd[0].type) {
        case 'absmove':
          actuallyMove(cmd[0]);
          break;
        case 'absheight':
          actuallyMoveHeight(cmd[0].z, cmd[0].state);
          break;
        case 'message':
          sendMessageUpdate(cmd[0].message);
          executeNext(); // We're sure the message sent via stream, move on
          break;
        case 'callbackname':
          sendCallbackUpdate(cmd[0].name);
          executeNext(); // We're sure the message sent via stream, move on
          break;
      }
    } else {

      // Set the duration of this command so when the board returns "OK",
      // will delay next command send
      commandDuration = Math.max(cmd[1], 0);

      // Set the actualPen state to match the state assumed at the time the
      // buffer item was created
      cncserver.actualPen = extend({}, cmd[2]);

      // Trigger an update for actualPen change
      sendPenUpdate();

      // Actually send the command out to serial
      serialCommand(cmd[0]);
    }

    sendBufferRemove();
  } else {
    // Buffer Empty? Cover our butts and ensure the "last buffer tip"
    // pen object is up to date with actualPen.

    // Save the offCanvas variable value to ensure it carries along with the tip
    // of the buffer.
    cncserver.actualPen.offCanvas = cncserver.pen.offCanvas;
    cncserver.pen = extend({}, cncserver.actualPen);

    bufferRunning = false;
  }
}

// Buffer interval catcher, starts running the buffer as soon as items exist in it
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
    sendBufferVars();
    executeNext();
  }
}, 10);


// SERIAL READ/WRITE ===========================================================

/**
 * Actually write a command to the open serial port (or simulate it)
 *
 * @param {string} command
 *  Exact, ready to write string to be sent
 * @returns {boolean}
 *   True if success, false if failure
 */
var nextExecutionTimeout = 0; // Hold on to the timeout index to be cleared
function serialCommand(command){
  if (!serialPort.write && !cncserver.pen.simulation) { // Not ready to write to serial!
    return false;
  }

  if (cncserver.gConf.get('debug')) {
    var word = !cncserver.pen.simulation ? 'Executing' : 'Simulating';
    console.log(word + ' serial command: ' + command);
  }

  // Actually write the data to the port (or simulate completion of write)
  if (!cncserver.pen.simulation) {
    try {
      // Once written, wait for command to drain completely, confirming the
      // entire command has been sent and we can send the next command.
      serialPort.write(command + "\r", function() {
        serialPort.drain(function(){
          // Command should be sent! Time out the next command send
          if (commandDuration < cncserver.gConf.get('bufferLatencyOffset')) {
            executeNext(); // Under threshold, "immediate" run
          } else {
            clearTimeout(nextExecutionTimeout);
            nextExecutionTimeout = setTimeout(executeNext,
              commandDuration - cncserver.gConf.get('bufferLatencyOffset')
            );
          }
        });
      });
    } catch(e) {
      console.error('Failed to write to the serial port!:', e);
      return false;
      // TODO: What _else_ should happen here?
    }
  } else {
    // Trigger executeNext as we're simulating and "drain" would never trigger
    // Command should be sent! Time out the next command send
    if (commandDuration < cncserver.gConf.get('bufferLatencyOffset')) {
      setTimeout(executeNext, 1);
    } else {
      clearTimeout(nextExecutionTimeout);
      nextExecutionTimeout = setTimeout(executeNext,
        commandDuration - cncserver.gConf.get('bufferLatencyOffset')
      );
    }
  }

  return true;
}

/**
 * Callback event function initialized on connect to handle incoming data.
 *
 * @param {string} data
 *   Incoming data from serial port
 *
 * @see connectSerial
 */

function serialReadline(data) {
  if (data.trim() !== cncserver.botConf.get('controller').ack) {
    console.error('Message From Controller: ' + data);

    // Assume error was on startup, and resend setup
    sendBotConfig();
  }
}

/**
 * Global event callback for serial close/disconnect, initialized on connect.
 * Starts simulation mode immediately to keep sends valid.
 *
 * @see connectSerial
 */
function serialPortCloseCallback() {
  console.log('Serialport connection to "' + cncserver.gConf.get('serialPath') + '" lost!! Did it get unplugged?');
  serialPort = false;

  // Assume the last serialport isn't coming back for a while... a long vacation
  cncserver.gConf.set('serialPath', '');
  simulationModeInit();
}

// Helper to initialize simulation mode
function simulationModeInit() {
  console.log("=======Continuing in SIMULATION MODE!!!============");
  cncserver.pen.simulation = 1;
}

/**
 * Helper function to manage initial serial connection and reconnection.
 *
 * @param {object} options
 *   Holds all possible callbacks for the serial connection:
 *     connect: Callback for successful serial connect event
 *     success: Callback for general success
 *     error: Callback for init/connect error, arg of error string/object
 *     disconnect: Callback for close/unexpected disconnect
 *     complete: Callback for general completion
 */
function connectSerial(options){
  var autoDetect = false;
  var stat = false;

  // Attempt to auto detect EBB Board via PNPID
  if (cncserver.gConf.get('serialPath') === "" || cncserver.gConf.get('serialPath') === '{auto}') {
    autoDetect = true;
    console.log('Finding available serial ports...');
  } else {
    console.log('Using passed serial port "' + cncserver.gConf.get('serialPath') + '"...');
  }

  require("serialport").list(function (err, ports) {
    var portNames = ['None'];
    if (cncserver.gConf.get('debug')) console.log('Full Available Port Data:', ports);
    for (var portID in ports){
      portNames[portID] = ports[portID].comName;

      // Sanity check manufacturer (returns undefined for some devices in Serialport 1.2.5)
      if (typeof ports[portID].manufacturer != 'string') {
        ports[portID].manufacturer = '';
      }

      // Specific board detect for linux
      if (ports[portID].pnpId.indexOf(cncserver.botConf.get('controller').name) !== -1 && autoDetect) {
        cncserver.gConf.set('serialPath', portNames[portID]);
      // All other OS detect
      } else if (ports[portID].manufacturer.indexOf(cncserver.botConf.get('controller').manufacturer) !== -1 && autoDetect) {
        cncserver.gConf.set('serialPath', portNames[portID]);
      }
    }

    console.log('Available Serial ports: ' + portNames.join(', '));

    // Try to connect to serial, or exit with error codes
    if (cncserver.gConf.get('serialPath') === "" || cncserver.gConf.get('serialPath') === '{auto}') {
      console.log(cncserver.botConf.get('controller').name + " not found. Are you sure it's connected? Error #22");
      if (options.error) options.error(cncserver.botConf.get('controller').name + ' not found.');
    } else {
      console.log('Attempting to open serial port: "' + cncserver.gConf.get('serialPath') + '"...');
      try {
        serialPort = new SerialPort(cncserver.gConf.get('serialPath'), {
          baudrate : Number(cncserver.botConf.get('controller').baudRate),
          parser: serialport.parsers.readline("\r"),
          disconnectedCallback: options.disconnect
        });

        if (options.connect) serialPort.on("open", options.connect);

        console.log('Serial connection open at ' + cncserver.botConf.get('controller').baudRate + 'bps');
        cncserver.pen.simulation = 0;
        if (options.success) options.success();
      } catch(e) {
        console.log("Serial port failed to connect. Is it busy or in use? Error #10");
        console.log('SerialPort says:', e);
        if (options.error) options.error(e);
      }
    }

    // Complete callback
    if (options.complete) options.complete(stat);
  });
}
