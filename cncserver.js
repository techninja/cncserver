/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Supports EiBotBoart for Eggbot, Ostrich Eggbot and Sylvia's Super-Awesome
 * WaterColorBot
 *
 */

// REQUIRES ====================================================================
var nconf = require('nconf');
var express = require('express');
var fs = require('fs');

// CONFIGURATION ===============================================================
var gConf = new nconf.Provider();
var botConf = new nconf.Provider();

// Pull conf from env, or arguments
gConf.env().argv();

// Pull conf from file
gConf.use('file', { file: './config.ini', format: nconf.formats.ini}).load();

// Set Global Config Defaults
gConf.defaults({
  httpPort: 4242,
  swapMotors: false,
  invertAxis: {
    x: true,
    y: false
  },
  serialPath: "{auto}", // Empty for auto-config
  botType: 'watercolorbot'
});

// Save Global Conf file defaults if not saved
if(!fs.existsSync('./config.ini')) {
  var def = gConf.stores['defaults'].store;
  for(var key in def) {
    if (key != 'type'){
      gConf.set(key, def[key]);
    }
  }
  gConf.save();
}

// Load bot config file based on botType global config
var botTypeFile = './machine_types/' + gConf.get('botType') + '.ini';
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

// Serial specific setup
var serialPort = false;
var SerialPort = require("serialport").SerialPort;

// Attempt Initial Serial Connection
connectSerial(true);

// STATE Variables
var pen  = {
  x: 0, // Assume we start in top left corner
  y: 0,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  tool: 'color0',
  lastDuration: 0, // Holds the last movement timing in milliseconds
  distanceCounter: 0, // Holds a running tally of distance travelled
  simulation: 0 // Fake everything and act like it's working, no serial
}

// No events are bound till we have a real serial connection
function serialPortReadyCallback() {

  // Start express hosting the site from "webroot" folder on the given port
  server.listen(gConf.get('httpPort'));
  app.configure(function(){
    app.use("/", express.static(__dirname + '/webroot'));
    app.use(express.bodyParser());
  });
  console.log('CNC server listening on localhost:' + gConf.get('httpPort'));

  // Set initial EBB values from Config
  // SERVO
  console.log('Sending EBB config...')
  serialCommand('SC,4,' + botConf.get('servo:min'));
  serialCommand('SC,5,' + botConf.get('servo:max'));
  serialCommand('SC,10,' + botConf.get('servo:rate'));
  serialCommand('EM,' + botConf.get('speed:precision'));

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
        connectSerial(false, callback);
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
          setTimeout(function(){
            callback(data);
          }, botConf.get('servo:duration'));
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

    // Something reall bad happened here...
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
    var duration = parseInt(distance / speed * 1000); // How many steps a second?

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
        setTimeout(function(){
          callback(data);
        }, duration);
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

  // BLOCKING SERIAL READ/WRITE ================================================
  function serialCommand(command, callback){
    console.log('Executing serial command: ' + command);
    if (!pen.simulation) {
      serialPort.write(command + "\r", function(err, results) {
        // TODO: Better Error Handling
        if (err) {
          // What kind of error is this anyways? :P
          console.log('err ' + err);
          if (callback) callback(false);
        } else {
          if (callback) callback(true);
        }
      });
    } else {
      if (callback) callback(true);
    }
  }
};

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
function connectSerial(init, callback){
  var autoDetect = false;

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
      }
    }

    console.log('Available Serial ports: ' + portNames.join(', '));

    // Try to connect to serial, or exit with error codes
    if (gConf.get('serialPath') == "" || gConf.get('serialPath') == '{auto}') {
      console.log(botConf.get('controller') + " not found. Are you sure it's connected? Error #22");
      simulationModeInit();
      if (init) serialPortReadyCallback();
      if (callback) callback(false);
    } else {
      console.log('Attempting to open serial port: "' + gConf.get('serialPath') + '"...');
      try {
        serialPort = new SerialPort(gConf.get('serialPath'), {baudrate : Number(botConf.get('baudRate'))});
        serialPort.on("open", serialPortReadyCallback);
        serialPort.on("close", serialPortCloseCallback);
        console.log('Serial connection open at ' + botConf.get('baudRate') + 'bps');
        pen.simulation = 0;
        if (callback) callback(true);
      } catch(e) {
        console.log("Serial port failed to connect. Is it busy or in use? Error #10");
        console.log('SerialPort says:', e);
        simulationModeInit();
        if (init) serialPortReadyCallback();
        if (callback) callback(false);
      }
    }
  });
}
