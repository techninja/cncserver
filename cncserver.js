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
  scratch: require('./scratch/cncserver.scratch.js') // Scratch support module.
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
  showSerial: false, // Specific debug to show serial data.
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

// Utlities and wrappers.
require('./src/cncserver.utils.js')(cncserver);

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
cncserver.actualPen = cncserver.utils.extend({}, cncserver.pen);

// INTIAL SETUP ================================================================

// Load the Global Configuration (from config, defaults & CL vars)
cncserver.settings.loadGlobalConfig(function standaloneOrModuleInit() {
    // Only if we're running standalone... try to start the server immediately!
    if (!module.parent) {
      // Load the bot specific configuration, defaulting to gConf bot type
      cncserver.settings.loadBotConfig(function(){
        cncserver.ipc.initServer({localRunner: true}, function(){
          // Runner is ready! Attempt Initial Serial Connection.
          cncserver.serial.connect({
            error: function() {
              console.error('CONNECTSERIAL ERROR!');
              cncserver.serial.localTrigger('simulationStart');
              cncserver.serial.localTrigger('serialReady');
            },
            connect: function(){
              console.log('CONNECTSERIAL CONNECT!');
              cncserver.serial.localTrigger('serialReady');
            },
            disconnect: function() {
              cncserver.serial.localTrigger('serialClose');
            }
          });
        });
      });

    } else { // Export the module's useful API functions! ======================
      // Enherit all module added exports.
      module.exports = cncserver.exports;

      // Connect to serial and start server
      module.exports.start = function(options) {
        // Add low-level short-circuit to avoid Socket.IO overhead
        if (typeof options.bufferUpdate === 'function') {
          module.exports.bufferUpdateTrigger = options.bufferUpdate;
        }

        if (typeof options.penUpdate === 'function') {
          module.exports.penUpdateTrigger = options.penUpdate;
        }

        cncserver.settings.loadBotConfig(function(){
          // Before we can attempt to connect to the serialport, we must ensure
          // The IPC runner is connected...

          cncserver.ipc.initServer(
            {localRunner: options.localRunner}, function(){
            // Runner is ready! Attempt Initial Serial Connection.
            cncserver.serial.connect({
              success: function() { // Successfully connected
                if (options.success) options.success();
              },
              connect: function() {
                // Callback for first serial connect, or re-connect
                cncserver.serial.localTrigger('serialReady');
                if (options.connect) options.connect();
              },
              disconnect: function() { // Callback for serial disconnect
                cncserver.serial.localTrigger('serialClose');
                if (options.disconnect) options.disconnect();
              },
              error: function(info) {
                if (options.error) options.error(info);
                cncserver.serial.localTrigger('simulationStart');
                cncserver.serial.localTrigger('serialReady');
              }
            });
          });
        }, options.botType);
      };

      // Direct configuration access (use the getters and override setters!)
      module.exports.conf = {
        bot: cncserver.botConf,
        global: cncserver.gConf
      };

      // Continue with simulation mode
      module.exports.continueSimulation = function(){
        cncserver.serial.localTrigger('simulationStart');
      };

      // Export Serial Ready Init (starts webserver)
      module.exports.serialReadyInit = function(){
        cncserver.serial.localTrigger('serialReady');
      };

    }
  }
);
