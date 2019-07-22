/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Officially Supports:
 *  - EiBotBoard for Eggbot/Ostrich Eggbot: http://egg-bot.com
 *  - WaterColorBot: http://WaterColorBot.com
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
const cncserver = { // Master object for holding/passing stuff!
  bot: {}, // Holds clean rendered settings set after botConfig is loaded
  exports: {}, // This entire object will be added to the module.exports,
};

global.__basedir = __dirname;

// Global Defaults (also used to write the initial config.ini)
cncserver.globalConfigDefaults = {
  httpPort: 4242,
  httpLocalOnly: true,
  swapMotors: false, // Global setting for bots that don't have it configured
  invertAxis: {
    x: false,
    y: false,
  },
  maximumBlockingCallStack: 100, // Limit for the # blocking sequential calls
  showSerial: false, // Specific debug to show serial data.
  serialPath: '{auto}', // Empty for auto-config
  bufferLatencyOffset: 30, // Number of ms to move each command closer together
  corsDomain: '*', // Start as open to CORs enabled browser clients
  debug: false,
  botType: 'watercolorbot',
  scratchSupport: true,
  flipZToggleBit: false,
  botOverride: {
    info: 'Override bot settings E.G. > [botOverride.eggbot] servo:max = 1234',
  },
};

// COMPONENT REQUIRES ==========================================================

// Load all components.
const components = require('./components');

// TODO: Find a better way to do this.
for (const [key, path] of Object.entries(components)) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const component = require(path)(cncserver);
  cncserver[key] = component;
  if (component && component.exports) {
    cncserver.exports = { ...cncserver.exports, ...component.exports };
    delete component.exports;
  }
}

// TODO: Convert to promises instaed of endless callbacks and error management.

// Describe the API via the OpenAPI v3 standard.
// API changes:
// * Allow X, Y, Z in one request
// * Multiple pausable & injectable generic to specific rendering buffers/queues
// * Manages refilling via buffer middleware "hooks"(?)
// * Provides all RP SVG draw rendering, returns simplified path plan as SVG or
//   list of paths to be drawn.
// * Individual stateless closed path filling
// * Decent looking basic HTML control interface with hand drawing, mobile.
// * Ensure full redrawing via paper of current progress via Paper.js.
// * Full 2D path planning (used for shape fill, etc), allows for Z control as well
// * Compression for update streams, possibly binary?
// * Move client to axios
// * Allow server IP to be discoverable (https://www.npmjs.com/package/bonjour)
// * Version checking/Range management for supported bots?
// * Support all RoboPaint APIs and update status on the HTML app
// * Support all RP settings, groupings, GET/POST etc.
// * More testing?

// INTIAL SETUP ================================================================

// Load the Global Configuration (from config, defaults & CL vars)
cncserver.settings.loadGlobalConfig(() => {
  // Only if we're running standalone... try to start the server immediately!
  if (!module.parent) {
    // Load the bot specific configuration, defaulting to gConf bot type
    cncserver.settings.loadBotConfig(() => {
      cncserver.ipc.initServer({ localRunner: true }, () => {
        // Runner is ready! Attempt Initial Serial Connection.
        cncserver.serial.connect({
          error: () => {
            console.error('CONNECTSERIAL ERROR!');
            cncserver.serial.localTrigger('simulationStart');
            cncserver.serial.localTrigger('serialReady');
          },
          connect: () => {
            console.log('CONNECTSERIAL CONNECT!');
            cncserver.serial.localTrigger('serialReady');
          },
          disconnect: () => {
            cncserver.serial.localTrigger('serialClose');
          },
        });
      });
    });
  } else { // Export the module's useful API functions! =================
    // Enherit all module added exports.
    module.exports = cncserver.exports;

    // Connect to serial and start server
    module.exports.start = (options) => {
      // Add low-level short-circuit to avoid Socket.IO overhead
      if (typeof options.bufferUpdate === 'function') {
        module.exports.bufferUpdateTrigger = options.bufferUpdate;
      }

      if (typeof options.penUpdate === 'function') {
        module.exports.penUpdateTrigger = options.penUpdate;
      }

      cncserver.settings.loadBotConfig(() => {
        // Before we can attempt to connect to the serialport, we must ensure
        // The IPC runner is connected...

        cncserver.ipc.initServer({ localRunner: options.localRunner }, () => {
          // Runner is ready! Attempt Initial Serial Connection.
          cncserver.serial.connect({
            success: () => { // Successfully connected
              if (options.success) options.success();
            },
            connect: () => {
              // Callback for first serial connect, or re-connect
              cncserver.serial.localTrigger('serialReady');
              if (options.connect) options.connect();
            },
            disconnect: () => { // Callback for serial disconnect
              cncserver.serial.localTrigger('serialClose');
              if (options.disconnect) options.disconnect();
            },
            error: (info) => {
              if (options.error) options.error(info);
              cncserver.serial.localTrigger('simulationStart');
              cncserver.serial.localTrigger('serialReady');
            },
          });
        });
      }, options.botType);
    };

    // Direct configuration access (use the getters and override setters!)
    module.exports.conf = {
      bot: cncserver.settings.botConf,
      global: cncserver.settings.gConf,
    };

    // Continue with simulation mode
    module.exports.continueSimulation = () => {
      cncserver.serial.localTrigger('simulationStart');
    };

    // Export Serial Ready Init (starts webserver)
    module.exports.serialReadyInit = () => {
      cncserver.serial.localTrigger('serialReady');
    };
  }
});
