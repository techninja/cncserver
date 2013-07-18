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
var nconf = require('nconf');
var express = require('express');
var fs = require('fs');
var path = require('path');

// CONFIGURATION ===============================================================
var gConf = new nconf.Provider();
var botConf = new nconf.Provider();

// Pull conf from env, or arguments
gConf.env().argv();

// STATE Variables
var pen  = {
  x: 0, // Assume we start in top left corner
  y: 0,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  busy: false,
  tool: 'color0',
  lastDuration: 0, // Holds the last movement timing in milliseconds
  distanceCounter: 0, // Holds a running tally of distance travelled
  simulation: 0 // Fake everything and act like it's working, no serial
}
// Pull conf from file
var configPath = path.resolve(__dirname, 'config.ini');
gConf.use('file', {
  file: configPath,
  format: nconf.formats.ini
}).load();

// Set Global Config Defaults
gConf.defaults({
  httpPort: 4242,
  swapMotors: false,
  invertAxis: {
    x: false,
    y: false
  },
  serialPath: "{auto}", // Empty for auto-config
  bufferLatencyOffset: 50, // Number of ms to move each command closer together
  botType: 'watercolorbot',
  botOverride: {
    info: "Override bot specific settings like > [botOverride.eggbot] servo:max = 1234"
  }
});

// Save Global Conf file defaults if not saved
if(!fs.existsSync(configPath)) {
  var def = gConf.stores['defaults'].store;
  for(var key in def) {
    if (key != 'type'){
      gConf.set(key, def[key]);
    }
  }
  gConf.save();
}

// Load bot config file based on botType global config
var botTypeFile = path.resolve(__dirname, 'machine_types', gConf.get('botType') + '.ini');
if (!fs.existsSync(botTypeFile)){
  console.log('CNC Server bot configuration file "' + botTypeFile + '" doesn\'t exist. Error #16');
  process.exit(16);
} else {
  botConf.use('file', {
    file: botTypeFile,
    format: nconf.formats.ini
  }).load();
  console.log('Successfully loaded config for ' + botConf.get('name') + '! Initializing...')
}

// Mesh in bot overrides from main config
var overrides = gConf.get('botOverride')[gConf.get('botType')];
for(var key in overrides) {
  botConf.set(key, overrides[key]);
}

// Hold common bot specific contants (also helps with string conversions)
var BOT = {
  workArea: {
    left: Number(botConf.get('workArea:left')),
    top: Number(botConf.get('workArea:top'))
  },
  maxArea: {
    width: Number(botConf.get('maxArea:width')),
    height: Number(botConf.get('maxArea:height'))
  }
}


// INTIAL SETUP ================================================================
var app = express();
var server = require('http').createServer(app);
var serialPort = false;
var SerialPort = require("serialport").SerialPort;


// Only if we're running standalone... try to start the server immediately!
if (!module.parent) {
  // Attempt Initial Serial Connection
  connectSerial({
    error: function() {
      console.log('CONNECTSERIAL ERROR!');
      simulationModeInit();
      serialPortReadyCallback();
    },
    connect: function(){
      //console.log('CONNECTSERIAL CONNECT!');
      serialPortReadyCallback();
    },
    disconnect: serialPortCloseCallback
  });

} else { // Export the module's useful API functions!
  // Connect to serial and start server
  exports.start = function(options) {
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
  }

  // Direct configuration access (use the getters and override setters!)
  exports.conf = {
    bot: botConf,
    global: gConf
  }

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

  // Send direct setup var command
  exports.sendSetup = function(id, value) {
    serialCommand('SC,' + id + ',' + value);
  }

  // Set pen direct command
  exports.setPen = function(value) {
    pen.state = value;
    serialCommand('SP,' + (pen.state == 1 ? 1 : 0));
  }


}

// Grouping function to send off the initial EBB configuration for the bot
function sendBotConfig() {
  console.log('Sending EBB config...')
  serialCommand('SC,4,' + botConf.get('servo:min'));
  serialCommand('SC,5,' + botConf.get('servo:max'));
  serialCommand('SC,10,' + botConf.get('servo:rate'));
  serialCommand('EM,' + botConf.get('speed:precision'));
}

// Start express HTTP server for API on the given port
var serverStarted = false;
function startServer() {
  // Only run start server once...
  if (serverStarted) return;
  serverStarted = true;

  // Catch Addr in Use Error
  server.on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
      console.log('Address in use, retrying...');
      setTimeout(function () {
        try {
          server.close();
        } catch(e) {
          console.log("Whoops, server wasn't running.. Oh well.")
        }

        server.listen(gConf.get('httpPort'));
      }, 1000);
    }
  });


  server.listen(gConf.get('httpPort'), function(){
    // Properly close down server on fail/close
    process.on('uncaughtException', function(err){ server.close() });
    process.on('SIGTERM', function(err){ server.close() });
  });
  app.configure(function(){
    app.use(express.bodyParser());
  });
}

// No events are bound till we have attempted a serial connection
function serialPortReadyCallback() {

  console.log('CNC server API listening on localhost:' + gConf.get('httpPort'));

  sendBotConfig();
  startServer();

  // CNC Server API ============================================================
  // Return/Set PEN state  API =================================================
  app.all("/pen", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    if (req.route.method == 'get') {
      // GET pen state
      res.send(JSON.stringify(pen));
    } else if (req.route.method == 'put') {
      // SET/UPDATE pen status
      setPen(req.body, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: 'Error'
          }));
        } else {
          if (req.body.ignoreTimeout){
            res.status(202).send(JSON.stringify(pen));
          } else {
            res.status(200).send(JSON.stringify(pen));
          }
        }
      });
    } else if (req.route.method == 'delete'){
      // Reset pen to defaults (park)
      console.log('Parking Pen...');
      setPen({state: 0});
      setPen({x: 0, y:0, park: true}, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: 'Error'
          }));
        } else {
          res.status(200).send(JSON.stringify(pen));
        }
      });
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  // Return/Set Motor state API ================================================
  app.all("/motors", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    // Disable/unlock motors
    if (req.route.method == 'delete') {
      console.log('Disabling motors');
      serialCommand('EM,0,0', function(data){
        if (data) {
          res.status(200).send(JSON.stringify({
            status: 'Disabled'
          }));
        } else {
          res.status(500).send(JSON.stringify({
            status: 'Error'
          }));
        }
      });
    } else if (req.route.method == 'put') {
      if (req.body.reset == 1) {
        pen.x = 0;
        pen.y = 0;
        console.log('Motor offset reset to zero')
        res.status(200).send(JSON.stringify({
          status: 'Motor offset zeroed'
        }));
      } else {
        res.status(406).send(JSON.stringify({
          status: 'Input not acceptable, see API spec for details.'
        }));
      }
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  // Get/Change Tool API ================================================
  app.all("/tools", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    var toolName = req.params.tool;
    if (req.route.method == 'get') { // Get list of tools
      res.status(200).send(JSON.stringify({tools: Object.keys(botConf.get('tools'))}));
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  app.all("/tools/:tool", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method == 'put') { // Set Tool
      if (botConf.get('tools:' + toolName)){
        setTool(toolName, function(data){
          pen.tool = toolName;
          res.status(200).send(JSON.stringify({
            status: 'Tool changed to ' + toolName
          }));
        })
      } else {
        res.status(404).send(JSON.stringify({
          status: 'Tool not found'
        }));
      }
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });


  // UTILITY FUNCTIONS =======================================================
  function setPen(inPen, callback) {
    // Force the distanceCounter to be a number (was coming up as null)
    pen.distanceCounter = Number(pen.distanceCounter);

    // Counter Reset
    if (inPen.resetCounter) {
      pen.distanceCounter = Number(0);
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

    // Validate inPen (just force invalid to be valid for now)
    if (inPen.state !== undefined){
      // Future will support non-integers, but for now, 0 or 1
      // TODO: Add support for pen up/down percentage
      inPen.state = Math.abs(parseInt(inPen.state));
      inPen.state = inPen.state > 1 ?  1 : inPen.state;
    } else {
      inPen.state = pen.state;
    }

    // State has changed
    if (inPen.state != pen.state) {
      // Flop state value on write
      serialCommand('SP,' + (pen.state == 1 ? 1 : 0), function(data){
        if (data) {
          pen.state = inPen.state;
        }

        // Pen lift / drop
        if (callback) {
          var servoDur = botConf.get('servo:duration');

          // Force the EBB to "wait" (block buffer) for the pen change state
          serialCommand('SM,' + servoDur + ',0,0');
          setTimeout(function(){
            callback(data);
          }, Math.max(servoDur - gConf.get('bufferLatencyOffset'), 0));
        }
      });

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

      // Sanity check incoming values
      inPen.x  = inPen.x > 100 ? 100 : inPen.x;
      inPen.x  = inPen.x < 0 ? 0 : inPen.x;

      inPen.y  = inPen.y > 100 ? 100 : inPen.y;
      inPen.y  = inPen.y < 0 ? 0 : inPen.y;

      // Convert the percentage values into real absolute and appropriate values
      var absInput = {
        x: BOT.workArea.left + ((inPen.x / 100) * (BOT.maxArea.width - BOT.workArea.left)),
        y: BOT.workArea.top + ((inPen.y / 100) * (BOT.maxArea.height - BOT.workArea.top))
      }

      if (inPen.park) {
        absInput.x-= BOT.workArea.left;
        absInput.y-= BOT.workArea.top;

        // Don't repark if already parked
        if (pen.x == 0 && pen.y == 0) {
          callback(false);
          return;
        }
      }

      // Actually move the pen!
      var distance = movePenAbs(absInput, callback, inPen.ignoreTimeout);
      if (pen.state) {
        pen.distanceCounter = Number(Number(distance) + Number(pen.distanceCounter));
      }
      return;
    }

    if (callback) callback(true);
  }

  // Tool change
  function setTool(toolName, callback) {
    var tool = botConf.get('tools:' + toolName);

    console.log('Changing to tool: ' + toolName);

    // Pen Up
    setPen({state: 0}, function(){
      // Move to the tool
      movePenAbs(tool, function(data){
        // Pen down
        setPen({state: 1}, function(){
          // Wiggle the brush a bit
          wigglePen(tool.wiggleAxis, tool.wiggleTravel, tool.wiggleIterations, function(){
            // Put the pen back up when done!
            setPen({state: 0}, function(){
              callback(data);
            });
          });
        });
      });
    });
  }

  // Move the Pen to an absolute point in the entire work area
  // Returns distance moved, in steps
  function movePenAbs(point, callback, immediate) {

    // Something really bad happened here...
    if (isNaN(point.x) || isNaN(point.y)){
      console.error('INVALID Move pen input, given:', point);
      callback(false);
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
      callback(true);
      return 0;
    }

    var distance = Math.sqrt( Math.pow(change.x, 2) + Math.pow(change.y, 2));
    var speed = pen.state ? botConf.get('speed:drawing') : botConf.get('speed:moving');
    var duration = Math.abs(Math.round(distance / speed * 1000)); // How many steps a second?

    // Don't pass a duration of 0! Makes the EBB DIE!
    if (duration == 0) duration = 1;

    // Save the duration state
    pen.lastDuration = duration;

    pen.x = point.x;
    pen.y = point.y;

    // Invert X or Y to match stepper direction
    change.x = gConf.get('invertAxis:x') ? change.x * -1 : change.x;
    change.y = gConf.get('invertAxis:y') ? change.y * -1 : change.y;

    // Swap motor positions
    if (gConf.get('swapMotors')) {
      change = {
        x: change.y,
        y: change.x
      }
    }

    // Send the final serial command
    serialCommand('SM,' + duration + ',' + change.x + ',' + change.y, function(data){
      // Can't trust this to callback when move is done, so trust duration
      if (immediate == 1) {
        callback(data);
      } else {
        // Set the timeout to occur sooner so the next command will execute
        // before the other is actually complete. This will push into the buffer
        // and allow for far smoother move runs.
        setTimeout(function(){
          callback(data);
        }, Math.max(duration - gConf.get('bufferLatencyOffset'), 0));
      }
    });

    return distance;
  }


  function wigglePen(axis, travel, iterations, callback){
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

      movePenAbs(point, function(){
        i++;

        if (i <= iterations){ // Wiggle again!
          _wiggleSlave(!toggle);
        } else { // Done wiggling, go back to start
          movePenAbs(start, callback);
        }
      })
    }
  }
}

// SERIAL READ/WRITE ================================================
function serialCommand(command, callback){
  var word = !pen.simulation ? 'Executing' : 'Simulating';
  console.log(word + ' serial command: ' + command);
  if (!pen.simulation) {
    serialPort.write(command + "\r", function(err, results) {
      // TODO: Better Error Handling
      if (err) {
        // What kind of error is this anyways? :P
        console.log('Serial Execution Error!!: ' + err);
        if (callback) callback(false);
      } else {
        if (callback) callback(true);
      }
    });
  } else {
    if (callback) callback(true);
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
    for (var portID in ports){
      portNames[portID] = ports[portID].comName;
      if (ports[portID].pnpId.indexOf(botConf.get('controller')) !== -1 && autoDetect) {
        gConf.set('serialPath', portNames[portID]);
      } else if (portNames[portID].indexOf('usbmodem') !== -1 && autoDetect) {
        // Cheap hack to detect on Mac!
        gConf.set('serialPath', portNames[portID]);
      } else if (portNames[portID].indexOf('COM') !== -1 && autoDetect && portID != 0) {
        // Cheap hack to detect on PC. What the heck? The hacks are multiplying!
        gConf.set('serialPath', portNames[portID]);
      }
    }

    console.log('Available Serial ports: ' + portNames.join(', '));

    // Try to connect to serial, or exit with error codes
    if (gConf.get('serialPath') == "" || gConf.get('serialPath') == '{auto}') {
      console.log(botConf.get('controller') + " not found. Are you sure it's connected? Error #22");
      if (options.error) options.error('Port not found.');
    } else {
      console.log('Attempting to open serial port: "' + gConf.get('serialPath') + '"...');
      try {
        serialPort = new SerialPort(gConf.get('serialPath'), {baudrate : Number(botConf.get('baudRate'))});

        if (options.connect) serialPort.on("open", options.connect);
        if (options.disconnect) serialPort.on("close", options.disconnect);

        console.log('Serial connection open at ' + botConf.get('baudRate') + 'bps');
        pen.simulation = 0;
        if (options.success) options.success();
      } catch(e) {
        console.log("Serial port failed to connect. Is it busy or in use? Error #10");
        console.log('SerialPort says:', e);
        if (options.error) options.error(e);
      }
    }

    // Complete callback
    if (options.complete) options.complete(stat)
  });
}
