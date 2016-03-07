"use strict";

/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Officially Supports:
 *  - EiBotBoard for Eggbot/Ostrich Eggbot: http://egg-bot.com
 *  - Sylvia's Super-Awesome WaterColorBot: http://WaterColorBot.com
 *  - The Axidraw Drawing machine: http://AxiDraw.com
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

// CONFIGURATION ===============================================================
var cncserver = { // Master object for holding/passing stuff!
  bot: {}, // Holds clean rendered settings set after botConfig is loaded
  exports: {}, // This entire object will be added to the module.exports
  scratch: require('./src/cncserver.scratch.js') // Scratch support/API addition
};

// Global Defaults (also used to write the initial config.ini)
cncserver.globalConfigDefaults = {
  httpPort: 4242,
  httpLocalOnly: true,
  swapMotors: false, // Global setting for bots that don't have it configured
  invertAxis: {
    x: false,
    y: false
  },
  maximumBlockingCallStack: 100, // Limit for the # blocking sequential calls
  serialPath: "{auto}", // Empty for auto-config
  bufferLatencyOffset: 30, // Number of ms to move each command closer together
  corsDomain: '*', // Start as open to CORs enabled browser clients
  debug: false,
  botType: 'watercolorbot',
  scratchSupport: true,
  flipZToggleBit: false,
  botOverride: {
    info: "Override bot settings E.G. > [botOverride.eggbot] servo:max = 1234"
  }
};

// COMPONENT REQUIRES ==========================================================

// Settings shortcuts/utils & initialization.
require('./src/cncserver.settings.js')(cncserver);

// Server setup and associated wrapper.
require('./src/cncserver.server.js')(cncserver);

// ReSTFul endpoint helper utilities.
require('./src/cncserver.rest.js')(cncserver);

// Register restful API endpoints.
require('./src/cncserver.api.js')(cncserver);

// IPC server and runner components.
require('./src/cncserver.ipc.js')(cncserver);

// Serial Components.
require('./src/cncserver.serial.js')(cncserver);

// Socket I/O Components.
require('./src/cncserver.sockets.js')(cncserver);

// Control/movement functionality.
require('./src/cncserver.control.js')(cncserver);

// Run/Queue/Buffer management functionality.
require('./src/cncserver.queue.js')(cncserver);


// STATE VARIABLES =============================================================

// The pen: this holds the state of the pen at the "latest tip" of the buffer,
// meaning that as soon as an instruction intended to be run in the buffer is
// received, this is updated to reflect the intention of the buffered item.
cncserver.pen = {
  x: null, // XY set by bot defined park position (assumed initial location)
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

// INTIAL SETUP ================================================================

// Load the Global Configuration (from config, defaults & CL vars)
cncserver.settings.loadGlobalConfig(function standaloneOrModuleInit() {
    // Only if we're running standalone... try to start the server immediately!
    if (!module.parent) {
      // Load the bot specific configuration, defaulting to gConf bot type
      cncserver.settings.loadBotConfig(function(){
        // TODO: Start the client runner! (run manually for now);
      });

    } else { // Export the module's useful API functions! ======================
      // Enherit all module added exports.
      module.exports = cncserver.exports;

      // Connect to serial and start server
      exports.start = function(options) {
        // Add low-level short-circuit to avoid Socket.IO overhead
        if (typeof options.bufferUpdate === 'function') {
          exports.bufferUpdateTrigger = options.bufferUpdate;
        }

        if (typeof options.penUpdate === 'function') {
          exports.penUpdateTrigger = options.penUpdate;
        }

        cncserver.settings.loadBotConfig(function(){
          cncserver.serial.connect({
            success: function() { // Successfully connected
              if (options.success) options.success();
            },
            error: function(info) { // Error during connection attempt
              if (options.error) options.error(info);
            },
            connect: function() {
              // Callback for first serial connect, or re-connect
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

      // Direct configuration access (use the getters and override setters!)
      exports.conf = {
        bot: cncserver.botConf,
        global: cncserver.gConf
      };

      // Continue with simulation mode
      exports.continueSimulation = function(){
        cncserver.serial.localTrigger('simulationStart');
      };

      // Export Serial Ready Init (starts webserver)
      exports.serialReadyInit = function(){
        cncserver.serial.localTrigger('serialReady');
      };

    }
  }
);


// COMMAND RUN QUEUE UTILS =====================================================

// Holds the MS time of the "current" command sent, as this should be limited
// by the run queue, this should only ever refer to what's being sent through.
// the following command will be delayed by this much time.
var commandDuration = 0;


/**
 * Execute the next command in the buffer, triggered by self, buffer interval
 * catcher loop below, and serialReadLine.
 *
 * @see serialReadLine
 */
function executeNext() {
  // Run the paused callback if applicable
  if (bufferNewlyPaused && bufferPauseCallback) {
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
          // Propagate distanceCounter to actualPen
          cncserver.actualPen.distanceCounter = cmd[2].distanceCounter;
          cncserver.control.actuallyMove(cmd[0]);
          break;
        case 'absheight':
          cncserver.control.actuallyMoveHeight(cmd[0].z, cmd[0].state);
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

    cncserver.buffer.running = false;
  }
}
