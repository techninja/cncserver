/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Supports EiBotBoart for Eggbot, Ostrich Eggbot and Sylvia's Super-Awesome
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

// CONFIGURATION ===============================================================
var gConf = new nconf.Provider();
var botConf = new nconf.Provider();

// Pull conf from env, or arguments
gConf.env().argv();


// SOCKET STUFF
io.on('connection', function(socket){
  //console.log('a user connected');

  socket.on('disconnect', function(){
    //console.log('user disconnected');
  });

});

function sendPenUpdate() {
  io.emit('pen update', actualPen);
}


function sendBufferUpdate() {
  io.emit('buffer update', {
    buffer: buffer,
    bufferRunning: bufferRunning,
    bufferPaused: bufferPaused
  });
}


// STATE Variables

// The pen: this holds the state of the pen at the "latest tip" of the buffer,
// meaning that as soon as an instruction is received, this variable is updated
// to reflect the intention of the buffered item.
var pen = {
  x: null, // XY to be set by bot defined park position (assumed initial location)
  y: null,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  height: 0, // Last set pen height in output servo value
  busy: false,
  tool: 'color0',
  lastDuration: 0, // Holds the last movement timing in milliseconds
  distanceCounter: 0, // Holds a running tally of distance travelled
  simulation: 0 // Fake everything and act like it's working, no serial
}

// actualPen: This is set to the state of the pen variable as it passes through
// the buffer queue and into the robot, meant to reflect the actual position and
// state of the robot, and will be where the pen object is reset to when the
// buffer is cleared and the future state is lost.
var actualPen = extend({}, pen);

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
  bufferLatencyOffset: 50, // Number of ms to move each command closer together
  corsDomain: '*', // Start as open to CORs enabled browser clients
  debug: false,
  botType: 'watercolorbot',
  scratchSupport: true,
  flipZToggleBit: false,
  botOverride: {
    info: "Override bot specific settings like > [botOverride.eggbot] servo:max = 1234"
  }
};

// Hold common bot specific contants (also helps with string conversions)
var BOT = {}; // Set after botConfig is loaded

// INTIAL SETUP ================================================================

// Global express initialization (must run before any endpoint creation)
app.configure(function(){
  app.use("/", express.static(__dirname + '/example'));
  app.use(express.bodyParser());
});

var serialport = require("serialport");
var serialPort = false;
var SerialPort = serialport.SerialPort;
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;
var bufferNewlyPaused = false; // Trigger for pause callback on executeNext()
var bufferPauseCallback = null;

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
    }

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
    }

    // Direct configuration access (use the getters and override setters!)
    exports.conf = {
      bot: botConf,
      global: gConf
    }

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
    }

    // Set pen direct command
    // TODO: Rewrite this to play nice with the buffer!!!!
    exports.setPen = function(value) {
      pen.state = value;
      serialCommand('SP,' + (pen.state == 1 ? 1 : 0));
    }
    exports.directSetPen=function(){};

    // Export ReST Server endpoint creation utility
    exports.createServerEndpoint = createServerEndpoint;
  }
}

// Grouping function to send off the initial configuration for the bot
function sendBotConfig() {
  // EBB Specific Config =================================
  if (botConf.get('controller').name == 'EiBotBoard') {
    console.log('Sending EBB config...')
    run('custom', 'EM,' + botConf.get('speed:precision'));

    // Send twice for good measure
    run('custom', 'SC,10,' + botConf.get('servo:rate'));
    run('custom', 'SC,10,' + botConf.get('servo:rate'));
  }

  var isVirtual = pen.simulation ? ' (simulated)' : '';
  console.info('---=== ' + botConf.get('name') + isVirtual + ' is ready to receive commands ===---');
}

// Start express HTTP server for API on the given port
var serverStarted = false;
function startServer() {
  // Only run start server once...
  if (serverStarted) return;
  serverStarted = true;

  var hostname = gConf.get('httpLocalOnly') ? 'localhost' : null;

  // Catch Addr in Use Error
  server.on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
      console.log('Address in use, retrying...');
      setTimeout(function () {
        closeServer();
        server.listen(gConf.get('httpPort'), hostname);
      }, 1000);
    }
  });

  server.listen(gConf.get('httpPort'), hostname, function(){
    // Properly close down server on fail/close
    process.on('uncaughtException', function(err){ console.log(err); closeServer(); });
    process.on('SIGTERM', function(err){ console.log(err); closeServer(); });
  });
}

function closeServer() {
  try {
    server.close();
  } catch(e) {
    console.log("Whoops, server wasn't running.. Oh well.")
  }
}

// No events are bound till we have attempted a serial connection
function serialPortReadyCallback() {

  console.log('CNC server API listening on ' +
    (gConf.get('httpLocalOnly') ? 'localhost' : '*') +
    ':' + gConf.get('httpPort')
  );

  // Is the serialport ready? Start reading
  if (!pen.simulation) {
    serialPort.on("data", serialReadline);
  }

  sendBotConfig();
  startServer();

  // Scratch v2 endpoint & API =================================================
  if (gConf.get('scratchSupport')) {
    console.info('Scratch v2 Programming support ENABLED');
    var pollData = {}; // "Array" of "sensor" data to be spat out to poll page
    var sizeMultiplier = 10; // Amount to increase size of steps
    var turtle = { // Helper turtle for relative movement
      x: BOT.workArea.absCenter.x,
      y: BOT.workArea.absCenter.y,
      sleeping: false,
      degrees: 0,
      distanceCounter: 0
    };

    pollData.render = function() {
      var out = "";

      // Loop through all existing/static pollData
      for (var key in this) {
        if (typeof this[key] == 'object') {
          var v = (typeof this[key] == 'string') ?  this[key] : this[key].join(' ');

          if (v !== '') {
            out += key + ' ' + v + "\n";
          }
        }
      }

      // Throw in full pen data as well
      for (var key in pen) {
        if (key == 'x') {
          out += 'x ' + (turtle.x - BOT.workArea.absCenter.x) / sizeMultiplier  + "\n";
        }else if (key == 'y') {
          out += 'y ' + (turtle.y - BOT.workArea.absCenter.y) / sizeMultiplier + "\n";

          // Add some other stuff while we're at it
          // TODO: Should probably automate all this output :P
          out += 'z ' + ((pen.state === 'draw' || pen.state === 1) ? '1' : '0') + "\n";

          var angleTemp = turtle.degrees + 90; // correct for "standard" Turtle orientation in Scratch
          if (angleTemp > 360) {
            angleTemp -= 360;
          }
          out += 'angle ' + angleTemp + "\n";
          out += 'sleeping ' + (turtle.sleeping ? '1' : '0')  + "\n";
        }else if (key == 'distanceCounter') {
          out += 'distanceCounter ' + turtle.distanceCounter / sizeMultiplier + "\n";
        } else {
          out += key + ' ' + pen[key] + "\n";
        }
      }
      return out;
    }

    // Helper function to add/remove busy watchers
    pollData.busy = function(id, destroy) {
      if (!pollData['_busy']) pollData['_busy'] = []; // Add busy placeholder)

      var index = pollData['_busy'].indexOf(id);

      if (destroy && index > -1) { // Remove
        pollData['_busy'].splice(index, 1);
      } else if (!destroy && index === -1) { // Add!
        pollData['_busy'].push(id);
      }
    }


    // SCRATCH v2 Specific endpoints =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    // Central poll returner (Queried ~30hz)
    createServerEndpoint("/poll", function(req, res){
      return {code: 200, body: pollData.render()};
    });

    // Flash crossdomain helper
    createServerEndpoint("/crossdomain.xml", function(req, res){
      return {code: 200, body: '<?xml version="1.0" ?><cross-domain-policy><allow-access-from domain="*" to-ports="' + gConf.get('httpPort') + '"/></cross-domain-policy>'};
    });

    // Initialize/reset status
    createServerEndpoint("/reset_all", function(req, res){
      turtle = { // Reset to default
        x: BOT.workArea.absCenter.x,
        y: BOT.workArea.absCenter.y,
        sleeping: false,
        degrees: 0,
        distanceCounter: 0
      };

      // Clear Run Buffer
      // @see /v1/buffer/ DELETE
      buffer = [];
      pen = extend({}, actualPen);

      pollData["_busy"] = []; // Clear busy indicators
      return {code: 200, body: ''};
    });

    // SCRATCH v2 Specific endpoints =^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=

    // Move Endpoint(s)
    createServerEndpoint("/park", moveRequest);
    createServerEndpoint("/coord/:x/:y", moveRequest);
    createServerEndpoint("/move/:op", moveRequest);
    createServerEndpoint("/move/:op/:arg", moveRequest);
    createServerEndpoint("/move/:op/:arg/:arg2", moveRequest);

    // Move request endpoint handler function
    function moveRequest(req, res){
      //pollData.busy(req.params.busyid);

      // Do nothing if sleeping
      if (turtle.sleeping) {
        // TODO: Do we care about running the math?
        return {code: 200, body: ''};
      }

      var op = req.params.op;
      var arg = req.params.arg;
      var arg2 = req.params.arg2;

      // Park
      if (req.url == '/park') {
        setHeight('up');
        setPen({x: BOT.park.x, y: BOT.park.y, park: true});
        return {code: 200, body: ''};
      }

      // Arbitrary Wait
      if (op == 'wait') {
        arg = parseFloat(arg) * 1000;
        run('wait', false, arg);
        return {code: 200, body: ''};
      }

      // Speed setting
      if (op == 'speed') {
        arg = parseFloat(arg) * 10;
        botConf.set('speed:drawing', arg);
        botConf.set('speed:moving', arg);
      }

      // Rotating Pointer? (just rotate)
      if (op == 'left' || op == 'right') {
        arg = parseInt(arg);
        turtle.degrees = op == 'right' ? turtle.degrees + arg : turtle.degrees - arg;
        if (turtle.degrees > 360) turtle.degrees -= 360;
        if (turtle.degrees < 0) turtle.degrees += 360;
        console.log('Rotate pen to ' + turtle.degrees + ' degrees');
        return {code: 200, body: ''};
      }

      // Rotate pointer towards turtle relative X/Y
      if (op == 'toward') {
        // Convert input X/Y from scratch coordinates
        var point = {
          x: (parseInt(arg) * sizeMultiplier) + BOT.workArea.absCenter.x,
          y: (-parseInt(arg2) * sizeMultiplier) + BOT.workArea.absCenter.y
        }

        var theta = Math.atan2(point.y - turtle.y, point.x - turtle.x);
        turtle.degrees = Math.round(theta * 180 / Math.PI);
          if (turtle.degrees > 360) turtle.degrees -= 360;
          if (turtle.degrees < 0) turtle.degrees += 360;

        console.log('Move relative towards ', point, ' from ', turtle);
        return {code: 200, body: ''};
      }

      // Rotate pointer directly
      if (op == 'absturn') {
        turtle.degrees = parseInt(arg) - 90; // correct for "standard" Turtle orientation in Scratch
        return {code: 200, body: ''};
      }

      // Simple Nudge X/Y
      if (op == 'nudge') {
        if (arg == 'y') {
          turtle[arg] += -1 * parseInt(arg2) * sizeMultiplier;
        } else {
          turtle[arg] += parseInt(arg2) * sizeMultiplier;
        }
      }

      // Move Pointer? Actually move!
      if (op == 'forward') {
        arg = parseInt(arg);

        console.log('Move pen by ' + arg + ' steps');
        var radians = turtle.degrees * (Math.PI / 180);
        turtle.x = Math.round(turtle.x + Math.cos(radians) * arg * sizeMultiplier);
        turtle.y = Math.round(turtle.y + Math.sin(radians) * arg * sizeMultiplier);
      }

      // Move x, y or both
      if (op == 'x' || op == 'y' || typeof req.params.x != 'undefined') {
        arg = parseInt(arg);

        if (op == 'x' || op == 'y') {
          turtle[op] = arg * sizeMultiplier;
        } else {

          // Word positions? convert to actual coordinates
          var wordX = ['left', 'center', 'right'].indexOf(req.params.y); // X/Y swapped for "top left" arg positions
          var wordY = ['top', 'center', 'bottom'].indexOf(req.params.x);
          if (wordX > -1) {
            var steps = centToSteps({x: (wordX / 2) * 100, y: (wordY / 2) * 100});
            turtle.x = steps.x;
            turtle.y = steps.y;
          } else {
            // Convert input X/Y to steps via multiplier
            turtle.x = parseInt(req.params.x) * sizeMultiplier;
            turtle.y = -1 * parseInt(req.params.y) * sizeMultiplier;  // In Scratch, positive Y is up on the page. :(

            // When directly setting XY position, offset by half for center 0,0
            turtle.x+= BOT.workArea.absCenter.x;
            turtle.y+= BOT.workArea.absCenter.y;
          }
        }

        console.log('Move pen to coord ' + turtle.x + ' ' + turtle.y);
      }

      // Sanity check values
      if (turtle.x > BOT.maxArea.width) {
        turtle.x = BOT.maxArea.width;
      }

      if (turtle.x < BOT.workArea.left) {
        turtle.x = BOT.workArea.left;
      }

      if (turtle.y > BOT.maxArea.height) {
        turtle.y = BOT.maxArea.height;
      }

      if (turtle.y < BOT.workArea.top) {
        turtle.y = BOT.workArea.top;
      }

      // Actually move pen
      var distance = movePenAbs(turtle);

      // Add up distance counter
      if (pen.state === 'draw' || pen.state === 1) {
        turtle.distanceCounter = parseInt(Number(distance) + Number(turtle.distanceCounter));
      }
      return {code: 200, body: ''};
    }

    // Pen endpoints
    createServerEndpoint("/pen", penRequest);
    createServerEndpoint("/pen/:op", penRequest);
    createServerEndpoint("/pen/:op/:arg", penRequest);

    function penRequest(req, res){
      var op = req.params.op;
      var arg = req.params.arg;

      // Reset internal counter
      if (op == 'resetDistance') {
        turtle.distanceCounter = 0;
        return {code: 200, body: ''};
      }

      // Toggle sleep/simulation mode
      if (op == 'sleep') {
        arg = parseInt(arg);
        turtle.sleeping = !!arg; // Convert integer to true boolean
        return {code: 200, body: ''};
      }

      // Do nothing if sleeping
      if (turtle.sleeping) {
        // TODO: Do we care about running the math?
        return {code: 200, body: ''};
      }

      // Set Pen up/down
      if (op == 'up' || op == "down") {
        if (op == 'down') {
          op = 'draw';
        }
        setHeight(op);
      }

      // Run simple wash
      if (op == 'wash'){
        setTool('water0');
        setTool('water1');
        setTool('water2');
      }

      // Turn off motors and zero to park pos
      if (op == 'off'){
        // Run in buffer to ensure correct timing
        run('callback', function(){
          run('custom', 'EM,0,0');
          var park = centToSteps(BOT.park, true);
          pen.x = park.x;
          pen.y = park.y;
        });
      }
      return {code: 200, body: ''};
    }

    // Tool set endpoints
    createServerEndpoint("/tool/:tool", toolRequest);
    createServerEndpoint("/tool/:type/:id", toolRequest);

    function toolRequest(req, res) {
      // Do nothing if sleeping
      if (turtle.sleeping) {
        // TODO: Do we care about running the math?
        return {code: 200, body: ''};
      }

      // Direct set tool
      if (req.params.tool) {
        setTool(req.params.tool);
      }

      // Set by ID (water/color)
      if (req.params.type) {
        setTool(req.params.type + parseInt(req.params.id));
      }

      return {code: 200, body: ''};
    }
  }

  // CNC Server API ============================================================
  // Return/Set CNCServer Configuration ========================================
  createServerEndpoint("/v1/settings", function(req, res){
    if (req.route.method == 'get') { // Get list of tools
      return {code: 200, body: {
        global: '/v1/settings/global',
        bot: '/v1/settings/bot'
      }};
    } else {
      return false;
    }
  });

  createServerEndpoint("/v1/settings/:type", function(req, res){
    // Sanity check type
    var setType = req.params.type;
    if (setType !== 'global' && setType !== 'bot'){
      return [404, 'Settings group not found'];
    }

    var conf = setType == 'global' ? gConf : botConf;

    function getSettings() {
      var out = {};
      // Clean the output for global as it contains all commandline env vars!
      if (setType == 'global') {
        var g = conf.get();
        for (var i in g) {
          if (i == "botOverride") {
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
    if (req.route.method == 'get') {
      return {code: 200, body: getSettings()};
    } else if (req.route.method == 'put') {
      for (var i in req.body) {
        conf.set(i, req.body[i]);
      }
      return {code: 200, body: getSettings()};
    } else {
      return false;
    }
  });

  // Return/Set PEN state  API =================================================
  createServerEndpoint("/v1/pen", function(req, res){
    if (req.route.method == 'put') {
      // SET/UPDATE pen status
      setPen(req.body, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: "Error setting pen!"
          }));
        } else {
          if (req.body.ignoreTimeout){
            res.status(202).send(JSON.stringify(pen));
          }
          res.status(200).send(JSON.stringify(pen));
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method == 'delete'){
      // Reset pen to defaults (park)
      setHeight('up');
      setPen({x: BOT.park.x, y: BOT.park.y, park: true}, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: "Error parking pen!"
          }));
        }
        res.status(200).send(JSON.stringify(pen));
      });

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method == 'get'){
      return {code: 200, body: pen};
    } else  {
      return false;
    }
  });

  // Return/Set Motor state API ================================================
  createServerEndpoint("/v1/motors", function(req, res){
    // Disable/unlock motors
    if (req.route.method == 'delete') {
      run('custom', 'EM,0,0');
      return [201, 'Disable Queued'];
    } else if (req.route.method == 'put') {
      if (req.body.reset == 1) {
        // TODO: This could totally break queueing as movements are queued with
        // offsets that break if the relative position doesn't match!
        var park = centToSteps(BOT.park, true);
        pen.x = park.x;
        pen.y = park.y;

        console.log('Motor offset reset to park position')
        return [200, 'Motor offset reset to park position'];
      } else {
        return [406, 'Input not acceptable, see API spec for details.'];
      }
    } else {
      return false;
    }
  });

  // Command buffer API ========================================================
  createServerEndpoint("/v1/buffer", function(req, res){
    if (req.route.method == 'get' || req.route.method == 'put') {

      // Pause/resume
      if (typeof req.body.paused == "boolean") {
        if (req.body.paused != bufferPaused) {
          bufferPaused = req.body.paused;
          console.log('Run buffer ' + (bufferPaused ? 'paused!': 'resumed!'));
          bufferRunning = false; // Force a followup check as the paused var has changed

          bufferNewlyPaused = bufferPaused; // Changed to paused!
          sendBufferUpdate();
        }
      }

      if (!bufferNewlyPaused || buffer.length === 0) {
        bufferNewlyPaused = false; // In case paused with 0 items in buffer

        return {code: 200, body: {
          running: bufferRunning,
          paused: bufferPaused,
          count: buffer.length,
          buffer: buffer
        }};
      } else { // Buffer isn't empty and we're newly paused
        // Wait until last item has finished before returning
        console.log('Waiting for last item to finish...');

        bufferPauseCallback = function(){
          res.status(200).send(JSON.stringify({
            running: bufferRunning,
            paused: bufferPaused,
            count: buffer.length,
            buffer: buffer
          }));

          bufferNewlyPaused = false;
        };

        return true; // Don't finish the response till later
      }

    } else if (req.route.method == 'delete') {
      buffer = [];

      // Reset the state of the buffer tip pen to the state of the actual robot.
      // If this isn't done, it will be assumed to be a state that was deleted
      // and never sent out in the line above.
      pen = extend({}, actualPen);

      console.log('Run buffer cleared!')
      return [200, 'Buffer Cleared'];
      sendBufferUpdate();
    } else {
      return false;
    }
  });

  // Get/Change Tool API =======================================================
  createServerEndpoint("/v1/tools", function(req, res){
    if (req.route.method == 'get') { // Get list of tools
      return {code: 200, body:{tools: Object.keys(botConf.get('tools'))}};
    } else {
      return false;
    }
  });

  createServerEndpoint("/v1/tools/:tool", function(req, res){
    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method == 'put') { // Set Tool
      if (botConf.get('tools:' + toolName)){
        setTool(toolName, function(data){
          pen.tool = toolName;
          res.status(200).send(JSON.stringify({
            status: 'Tool changed to ' + toolName
          }));
          sendPenUpdate();
        });
        return true; // Tell endpoint wrapper we'll handle the response
      } else {
        return [404, "Tool: '" + toolName + "' not found"];
      }
    } else {
      return false;
    }
  });


  // UTILITY FUNCTIONS =======================================================

  // Send direct setup var command
  exports.sendSetup = sendSetup;
  function sendSetup(id, value) {
    // TODO: Make this WCB specific, or refactor to be general
    run('custom', 'SC,' + id + ',' + value);
  }

  function setPen(inPen, callback) {
    // Force the distanceCounter to be a number (was coming up as null)
    pen.distanceCounter = parseInt(pen.distanceCounter);

    // Counter Reset
    if (inPen.resetCounter) {
      pen.distanceCounter = Number(0);
      sendPenUpdate();
      callback(true);
      return;
    }

    // Setting the value of simulation
    if (typeof inPen.simulation != "undefined") {

      // No change
      if (inPen.simulation == pen.simulation) {
        callback(true);
        return;
      }

      if (inPen.simulation == 0) { // Attempt to connect to serial
        connectSerial({complete: callback});
      } else {  // Turn off serial!
        // TODO: Actually nullify connection.. no use case worth it yet
        simulationModeInit();
      }

      return;
    }


    // State has changed
    if (typeof inPen.state != "undefined") {
      if (inPen.state != pen.state) {
        setHeight(inPen.state, callback);
        return;
      }
    }

    // Absolute positions are set
    if (inPen.x !== undefined){
      // Input values are given as percentages of working area (not max area)

      // Don't accept bad input
      if (isNaN(inPen.x) || isNaN(inPen.y) || !isFinite(inPen.x) || !isFinite(inPen.y)) {
        callback(false);
        return;
      }

      // Sanity check incoming values
      inPen.x  = inPen.x > 100 ? 100 : inPen.x;
      inPen.x  = inPen.x < 0 ? 0 : inPen.x;

      inPen.y  = inPen.y > 100 ? 100 : inPen.y;
      inPen.y  = inPen.y < 0 ? 0 : inPen.y;

      // Convert the percentage values into real absolute and appropriate values
      var absInput = centToSteps(inPen);

      // Are we parking?
      if (inPen.park) {
        // Don't repark if already parked
        var park = centToSteps(BOT.park, true);
        if (pen.x == park.x && pen.y == park.y) {
          if (callback) callback(false);
          return;
        }

        // Set Absolute input value to park position in steps
        absInput.x = park.x;
        absInput.y = park.y;
      }

      // Actually move the pen!
      var distance = movePenAbs(absInput, callback, inPen.ignoreTimeout);
      if (pen.state === 'draw' || pen.state === 1) {
        pen.distanceCounter = parseInt(Number(distance) + Number(pen.distanceCounter));
      }
      return;
    }

    if (callback) callback(true);
  }

  // Set servo position
  exports.setHeight = setHeight;
  function setHeight(height, callback) {
    var fullRange = false; // Whether to use the full min/max range
    var min = parseInt(botConf.get('servo:min'));
    var max = parseInt(botConf.get('servo:max'));
    var range = max - min;
    var stateValue = null; // Placeholder for what to set pen state to
    var p = botConf.get('servo:presets');
    var servoDuration = botConf.get('servo:duration');

    // Validate Height, and conform to a bottom to top based percentage 0 to 100
    if (isNaN(parseInt(height))){ // Textual position!
      if (p[height]) {
        stateValue = height;
        height = parseFloat(p[height]);
      } else { // Textual expression not found, default to UP
        height = p.up;
        stateValue = 'up';
      }
      fullRange = true;
    } else { // Numerical position (0 to 1), moves between up (0) and draw (1)
      height = Math.abs(parseFloat(height));
      height = height > 1 ?  1 : height; // Limit to 1
      stateValue = height;

      // Reverse value and lock to 0 to 100 percentage with 1 decimal place
      height = parseInt((1 - height) * 1000) / 10;
    }

    // Lower the range when using 0 to 1 values
    if (!fullRange) {
      min = ((p.draw / 100) * range) + min;
      max = ((p.up / 100) * range) + parseInt(botConf.get('servo:min'));

      range = max - min;
    }

    // Sanity check incoming height value to 0 to 100
    height = height > 100 ? 100 : height;
    height = height < 0 ? 0 : height;

    // Calculate the servo value from percentage
    height = Math.round(((height / 100) * range) + min);


    // Pro-rate the duration depending on amount of change
    if (pen.height) {
      range = parseInt(botConf.get('servo:max')) - parseInt(botConf.get('servo:min'));
      servoDuration = Math.round((Math.abs(height - pen.height) / range) * servoDuration)+1;
    }

    pen.height = height;
    pen.state = stateValue;

    // Run the height into the command buffer
    run('height', height, servoDuration);

    // Pen lift / drop
    if (callback) {
      // Force the EBB block buffer for the pen change state
      setTimeout(function(){
        callback(1);
      }, Math.max(servoDuration - gConf.get('bufferLatencyOffset'), 0));
    }
  }

  // Tool change
  exports.setTool = setTool;
  function setTool(toolName, callback) {
    var tool = botConf.get('tools:' + toolName);

    // No tool found with that name? Augh! Run AWAY!
    if (!tool) {
      if (callback) run('callback', callback);
      return false;
    }

    console.log('Changing to tool: ' + toolName);

    // Set the height based on what kind of tool it is
    // TODO: fold this into bot specific tool change logic
    var downHeight = toolName.indexOf('water') != -1 ? 'wash' : 'draw';

    // Pen Up
    setHeight('up');

    // Move to the tool
    movePenAbs(tool);

    // "wait" tools need user feedback to let cncserver know that it can continue
    if (typeof tool.wait != "undefined") {

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

      sendBufferUpdate();
    } else { // "Standard" WaterColorBot toolchange
      // Pen down
      setHeight(downHeight);

      // Wiggle the brush a bit
      wigglePen(tool.wiggleAxis, tool.wiggleTravel, tool.wiggleIterations);

      // Put the pen back up when done!
      setHeight('up');

      if (callback){
        run('callback', callback);
      }
    }
  }

  // Move the Pen to an absolute point in the entire work area
  // Returns distance moved, in steps
  function movePenAbs(point, callback, immediate) {

    // Something really bad happened here...
    if (isNaN(point.x) || isNaN(point.y)){
      console.error('INVALID Move pen input, given:', point);
      if (callback) callback(false);
      return 0;
    }

    // Sanity check absolute position input point
    point.x = Number(point.x) > BOT.maxArea.width ? BOT.maxArea.width : point.x;
    point.x = Number(point.x) < 0 ? 0 : point.x;

    point.y = Number(point.y) > BOT.maxArea.height ? BOT.maxArea.height : point.y;
    point.y = Number(point.y) < 0 ? 0 : point.y;

    var change = {
      x: Math.round(point.x - pen.x),
      y: Math.round(point.y - pen.y)
    }

    // Don't do anything if there's no change
    if (change.x == 0 && change.y == 0) {
      if (callback) callback(true);
      return 0;
    }

    // Duration/distance is only calculated as relative from last assumed point, which
    // may not actually ever happen, though it is likely to happen. Buffered items
    // may not be pushed out of order, but previos location may have changed as user
    // might pause the buffer, and move the actualPen position.
    // @see executeNext() for more details on how this is handled.
    var distance = getDistance(change);
    var duration = getDurationFromDistance(distance);

    // Save the duration state
    //pen.lastDuration = duration;

    // Set pen at new position
    pen.x = point.x;
    pen.y = point.y;

    // Queue the final absolute move (serial command generated later)
    run('move', {x: pen.x, y: pen.y}, duration);

    if (callback) {
      if (immediate == 1) {
        callback(1);
      } else {
        // Set the timeout to occur sooner so the next command will execute
        // before the other is actually complete. This will push into the buffer
        // and allow for far smoother move runs.

        var cmdDuration = Math.max(duration - gConf.get('bufferLatencyOffset'), 0);

        if (cmdDuration < 2) {
          callback(1);
        } else {
          setTimeout(function(){callback(1);}, cmdDuration);
        }

      }
    }

    return distance;
  }

  // Wiggle Pen for WCB toolchanges
  function wigglePen(axis, travel, iterations){
    var start = {x: Number(pen.x), y: Number(pen.y)};
    var i = 0;
    travel = Number(travel); // Make sure it's not a string

    // Start the wiggle!
    _wiggleSlave(true);

    function _wiggleSlave(toggle){
      var point = {x: start.x, y: start.y};

      if (axis == 'xy') {
        var rot = i % 4; // Ensure rot is always 0-3

        // This confuluted series ensure the wiggle moves in a proper diamond
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

// Util function, convert a percent into steps
function centToSteps(point, inMaxArea) {
  if (!inMaxArea) { // Calculate based on workArea
    return {
      x: BOT.workArea.left + ((point.x / 100) * BOT.workArea.width),
      y: BOT.workArea.top + ((point.y / 100) * BOT.workArea.height)
    };
  } else { // Calculate based on ALL area
    return {
      x: (point.x / 100) * BOT.maxArea.width,
      y: (point.y / 100) * BOT.maxArea.height
    };
  }
}

// Initialize global config
function loadGlobalConfig(cb) {
  // Pull conf from file
  var configPath = path.resolve(__dirname, 'config.ini');
  gConf.reset();
  gConf.use('file', {
    file: configPath,
    format: nconf.formats.ini
  }).load(function (){
    // Set Global Config Defaults
    gConf.defaults(globalConfigDefaults);

    // Save Global Conf file defaults if not saved
    if(!fs.existsSync(configPath)) {
      var def = gConf.stores['defaults'].store;
      for(var key in def) {
        if (key != 'type'){
          gConf.set(key, def[key]);
        }
      }

      gConf.save(function (err) {
        if (cb) cb();
      });
    } else { // Config file already exists
      if (cb) cb(); // Trigger the callback
    }

    // Output if debug mode is on
    if (gConf.get('debug')) {
      console.info('== CNCServer Debug mode is ON ==');
    }
  });
}

// Load bot config file based on botType global config
function loadBotConfig(cb, botType) {
  if (!botType) botType = gConf.get('botType');

  var botTypeFile = path.resolve(__dirname, 'machine_types', botType + '.ini');
  if (!fs.existsSync(botTypeFile)){
    console.error('CNC Server bot configuration file "' + botTypeFile + '" doesn\'t exist. Error #16');
    process.exit(16);
  } else {
    botConf.reset();
    botConf.use('file', {
      file: botTypeFile,
      format: nconf.formats.ini
    }).load(function(){

      // Mesh in bot overrides from main config
      var overrides = gConf.get('botOverride');
      if (overrides) {
        if (overrides[botType]) {
          for(var key in overrides[botType]) {
            botConf.set(key, overrides[botType][key]);
          }
        }
      }

      // Handy bot constant for easy number from string conversion
      BOT = {
        workArea: {
          left: Number(botConf.get('workArea:left')),
          top: Number(botConf.get('workArea:top'))
        },
        maxArea: {
          width: Number(botConf.get('maxArea:width')),
          height: Number(botConf.get('maxArea:height'))
        },
        park: {
          x: Number(botConf.get('park:x')),
          y: Number(botConf.get('park:y'))
        },
        commands : botConf.get('controller').commands
      }

      // Store assumed constants
      BOT.workArea.width = BOT.maxArea.width - BOT.workArea.left;
      BOT.workArea.height = BOT.maxArea.height - BOT.workArea.top;

      BOT.workArea.relCenter = {
        x: BOT.workArea.width / 2,
        y: BOT.workArea.height / 2
      };

      BOT.workArea.absCenter = {
        x: BOT.workArea.relCenter.x + BOT.workArea.left,
        y: BOT.workArea.relCenter.y + BOT.workArea.top
      }


      // Set initial pen position at park position
      var park = centToSteps(BOT.park, true);
      pen.x = park.x;
      pen.y = park.y;

      // Set global override for swapMotors if set by bot config
      if (typeof botConf.get('controller:swapMotors') !== 'undefined') {
        gConf.set('swapMotors', botConf.get('controller:swapMotors'));
      }

      console.log('Successfully loaded config for ' + botConf.get('name') + '! Initializing...')

      // Trigger the callback once we're done
      if (cb) cb();
    });
  }
}

// Utility wrapper for creating and managing standard responses and headers for endpoints
function createServerEndpoint(path, callback){
  var what = Object.prototype.toString;
  app.all(path, function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');
    res.set('Access-Control-Allow-Origin', gConf.get('corsDomain'));

    if (gConf.get('debug') && path !== '/poll') {
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
      if (typeof cbStat.body == "string") { // Send plaintext if body is string
        res.set('Content-Type', 'text/plain; charset=UTF-8');
        res.status(cbStat.code).send(cbStat.body);
      } else {
        res.status(cbStat.code).send(JSON.stringify(cbStat.body));
      }

    }
  });
}



// Given two points, find the difference and duration at current speed between them
function getPosChangeData(src, dest) {
   var change = {
    x: Math.round(dest.x - src.x),
    y: Math.round(dest.y - src.y)
  }

  // Calculate distance
  var duration = getDurationFromDistance(getDistance(change));

  // Adjust change direction/inversion
  if (botConf.get('controller').position == "relative") {
    // Invert X or Y to match stepper direction
    change.x = gConf.get('invertAxis:x') ? change.x * -1 : change.x;
    change.y = gConf.get('invertAxis:y') ? change.y * -1 : change.y;
  } else { // Absolute! Just use the "new" absolute X & Y locations
    change.x = pen.x;
    change.y = pen.y;
  }

  // Swap motor positions
  if (gConf.get('swapMotors')) {
    change = {
      x: change.y,
      y: change.x
    }
  }

  return {d: duration, x: change.x, y: change.y};
}

// Get a distance/length of the given vector
function getDistance(vector) {
  return Math.sqrt( Math.pow(vector.x, 2) + Math.pow(vector.y, 2));
}

// Calculate the given assumed duration from the number of steps
function getDurationFromDistance(distance, min) {
  if (typeof min === "undefined") min = 1;

  // Use given speed over distance to calculate duration
  var speed = pen.state ? botConf.get('speed:drawing') : botConf.get('speed:moving');
    speed = (speed/100) * botConf.get('speed:max'); // Convert to steps from percentage

    // Sanity check speed value
    speed = speed > botConf.get('speed:max') ? botConf.get('speed:max') : speed;
    speed = speed < botConf.get('speed:min') ? botConf.get('speed:min') : speed;
  return Math.max(Math.abs(Math.round(distance / speed * 1000)), min); // How many steps a second?
}


// COMMAND RUN QUEUE UTILS ==========================================

// Holds the MS time of the "current" command sent, as this should be limited
// by the run queue, this should only ever refer to what's being sent through.
// the following command will be delayed by this much time.
var commandDuration = 0;

// Add command to serial command runner
function run(command, data, duration) {
  var c = '';

  // Sanity check duration to minimum of 1, int only
  duration = !duration ? 1 : Math.abs(parseInt(duration));
  duration = duration <= 0 ? 1 : duration;

  switch (command) {
    case 'move':
      // Instead of a string command, this is buffered as an object
      c = {type: 'absmove', x: data.x, y: data.y};
      break;
    case 'height':
      // Send a new setup value for the the up position, then trigger "pen up"
      run('custom', cmdstr('movez', {z: data}));

      // If there's a togglez, run it after setting Z
      if (BOT.commands.togglez) {
        run('custom', cmdstr('togglez', {t: gConf.get('flipZToggleBit') ? 1 : 0}));
      }

      run('wait', '', duration);
      return;
      break;
    case 'wait':
      // Send wait, blocking buffer
      if (!BOT.commands.wait) return false;
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
  buffer.unshift([c, duration, extend({}, pen)]);
  sendBufferUpdate();
}

// Create a bot specific serial command string from values
function cmdstr(name, values) {
  if (!name || !BOT.commands[name]) return ''; // Sanity check

  var out = BOT.commands[name];

  for(var v in values) {
    out = out.replace('%' + v, values[v]);
  }

  return out;
}

// Buffer self-runner
function executeNext() {
  // Run the paused callback if applicable
  if (bufferNewlyPaused) {
    bufferPauseCallback();
  }

  // Don't continue execution if paused
  if (bufferPaused) return;

  if (buffer.length) {
    var cmd = buffer.pop();
    sendBufferUpdate();

    // Process a single line of the buffer =======================================
    // ===========================================================================

    if (typeof cmd[0] === "function") { // Custom Callback buffer item
      // Timing for this should be correct because of commandDuration below!
      cmd[0](1);
      executeNext();
    } else if (typeof cmd[0] === "object") { // Detailed object with special needs
      if (cmd[0].type = "absmove") {
        // Get the amount of change/duration from difference between actualPen and
        // absolute position in buffered item request.
        var change = getPosChangeData(actualPen, cmd[0]);
        serialCommand(cmdstr('movexy', change)); // Send the X, Y an Duration

        // Pass along the correct duration through to actualPen, via the buffer
        // pen object being inherited.
        cmd[2].lastDuration = change.d;
        commandDuration = Math.max(change.d, 0);
      }
    } else {
      // Set the duration of this command so when the board returns "OK",
      // will delay next command send
      commandDuration = Math.max(cmd[1], 0);

      // Actually send the command out to serial
      serialCommand(cmd[0]);
    }

    // Set the actualPen state to match the state assumed at the time the buffer
    // item was created
    actualPen = extend({}, cmd[2]);
    sendPenUpdate();

  } else {
    bufferRunning = false;
    sendBufferUpdate();
  }
}

// Buffer interval catcher, starts running the buffer as soon as items exist in it
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
    sendBufferUpdate();
    executeNext();
  }
}, 10);


// SERIAL READ/WRITE ================================================
function serialCommand(command, callback){
  if (!serialPort.write && !pen.simulation) { // Not ready to write to serial!
    if (callback) callback(true);
    return;
  }

  if (gConf.get('debug')) {
    var word = !pen.simulation ? 'Executing' : 'Simulating';
    console.log(word + ' serial command: ' + command);
  }

  // Not much error catching.. but.. really, when does that happen?!
  if (!pen.simulation) {
    serialPort.write(command + "\r");
  } else {
    // Trigger next command as we're simulating and would never receive the ACK
    serialReadline(botConf.get('controller').ack);
  }

  if (callback) callback(true);
}

// READ (Initialized on connect)
function serialReadline(data) {
  if (data.trim() == botConf.get('controller').ack) {
    // Trigger the next buffered command (after its intended duration)
    if (commandDuration < 2) {
      executeNext();
    } else {
      setTimeout(executeNext, commandDuration);
    }

  } else {
    console.error('Message From Controller: ' + data);
    executeNext(); // Error, but continue anyways
  }
}

// Event callback for serial close
function serialPortCloseCallback() {
  console.log('Serialport connection to "' + gConf.get('serialPath') + '" lost!! Did it get unplugged?');
  serialPort = false;

  // Assume the last serialport isn't coming back for a while... a long vacation
  gConf.set('serialPath', '');
  simulationModeInit();
}

// Helper to initialize simulation mode
function simulationModeInit() {
  console.log("=======Continuing in SIMULATION MODE!!!============");
  pen.simulation = 1;
}

// Helper function to manage initial serial connection and reconnection
function connectSerial(options){
  var autoDetect = false;
  var stat = false;

  // Attempt to auto detect EBB Board via PNPID
  if (gConf.get('serialPath') == "" || gConf.get('serialPath') == '{auto}') {
    autoDetect = true;
    console.log('Finding available serial ports...');
  } else {
    console.log('Using passed serial port "' + gConf.get('serialPath') + '"...');
  }

  require("serialport").list(function (err, ports) {
    var portNames = ['None'];
    if (gConf.get('debug')) console.log('Full Available Port Data:', ports);
    for (var portID in ports){
      portNames[portID] = ports[portID].comName;

      // Sanity check manufacturer (returns undefined for some devices in Serialport 1.2.5)
      if (typeof ports[portID].manufacturer != 'string') {
        ports[portID].manufacturer = '';
      }

      // Specific board detect for linux
      if (ports[portID].pnpId.indexOf(botConf.get('controller').name) !== -1 && autoDetect) {
        gConf.set('serialPath', portNames[portID]);
      // All other OS detect
      } else if (ports[portID].manufacturer.indexOf(botConf.get('controller').manufacturer) !== -1 && autoDetect) {
        gConf.set('serialPath', portNames[portID]);
      }
    }

    console.log('Available Serial ports: ' + portNames.join(', '));

    // Try to connect to serial, or exit with error codes
    if (gConf.get('serialPath') == "" || gConf.get('serialPath') == '{auto}') {
      console.log(botConf.get('controller').name + " not found. Are you sure it's connected? Error #22");
      if (options.error) options.error(botConf.get('controller').name + ' not found.');
    } else {
      console.log('Attempting to open serial port: "' + gConf.get('serialPath') + '"...');
      try {
        serialPort = new SerialPort(gConf.get('serialPath'), {
          baudrate : Number(botConf.get('controller').baudRate),
          parser: serialport.parsers.readline("\r"),
          disconnectedCallback: options.disconnect
        });

        if (options.connect) serialPort.on("open", options.connect);

        console.log('Serial connection open at ' + botConf.get('controller').baudRate + 'bps');
        pen.simulation = 0;
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
