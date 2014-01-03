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
  height: 0, // Last set pen height in output servo value
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
  httpLocalOnly: true,
  swapMotors: false,
  invertAxis: {
    x: false,
    y: false
  },
  serialPath: "{auto}", // Empty for auto-config
  bufferLatencyOffset: 50, // Number of ms to move each command closer together
  debug: false,
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

// Output if debug mode is on
if (gConf.get('debug')) {
  console.log('== CNCServer Debug mode is ON ==');
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
  },
  commands : botConf.get('controller').commands
}

// INTIAL SETUP ================================================================
var app = express();
var server = require('http').createServer(app);

var serialport = require("serialport");
var serialPort = false;
var SerialPort = serialport.SerialPort;
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;


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

  // Set pen direct command
  exports.setPen = function(value) {
    pen.state = value;
    serialCommand('SP,' + (pen.state == 1 ? 1 : 0));
  }
  exports.directSetPen=function(){};

  // ReST Server endpoint creation utility
  exports.createServerEndpoint = function(path, callback){
    var what = Object.prototype.toString;
    app.all(path, function(req, res){
      res.set('Content-Type', 'application/json; charset=UTF-8');

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
        res.status(cbStat.code).send(JSON.stringify(cbStat.body));
      }
    });
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

  app.configure(function(){
    app.use("/", express.static(__dirname + '/example'));
    app.use(express.bodyParser());
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

  // CNC Server API ============================================================
  // Return/Set CNCServer Configuration ========================================
  app.all("/v1/settings", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');
    if (req.route.method == 'get') { // Get list of tools
      res.status(200).send(JSON.stringify({
        global: '/v1/settings/global',
        bot: '/v1/settings/bot'
      }));
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  app.all("/v1/settings/:type", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    // Sanity check type
    var setType = req.params.type;
    if (setType !== 'global' && setType !== 'bot'){
      res.status(404).send(JSON.stringify({
        status: 'Settings group not found'
      }));
      return;
    }

    var conf = setType == 'global' ? gConf : botConf;

    function getSettingsJSON() {
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
      return JSON.stringify(out);
    }

    // Get the full list for the type
    if (req.route.method == 'get') {
      res.status(200).send(getSettingsJSON());
    } else if (req.route.method == 'put') {
      for (var i in req.body) {
        conf.set(i, req.body[i]);
      }
      res.status(200).send(getSettingsJSON());
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  // Return/Set PEN state  API =================================================
  app.all("/v1/pen", function(req, res){
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
      setHeight('up');
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
  app.all("/v1/motors", function(req, res){
    res.set('Content-Type', 'application/json; charset=UTF-8');

    // Disable/unlock motors
    if (req.route.method == 'delete') {
      run('custom', 'EM,0,0');
      res.status(201).send(JSON.stringify({
        status: 'Disable Queued'
      }));
    } else if (req.route.method == 'put') {
      if (req.body.reset == 1) {
        // TODO: This could totally break queueing as movements are queued with
        // offsets that break if the relative position doesn't match!
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
  app.all("/v1/tools", function(req, res){
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

  app.all("/v1/tools/:tool", function(req, res){
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

  // Send direct setup var command
  exports.sendSetup = sendSetup;
  function sendSetup(id, value) {
    run('custom', 'SC,' + id + ',' + value);
  }

  function setPen(inPen, callback) {
    // Force the distanceCounter to be a number (was coming up as null)
    pen.distanceCounter = parseInt(pen.distanceCounter);

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

    var distance = Math.sqrt( Math.pow(change.x, 2) + Math.pow(change.y, 2));
    var speed = pen.state ? botConf.get('speed:drawing') : botConf.get('speed:moving');
    var duration = Math.abs(Math.round(distance / speed * 1000)); // How many steps a second?

    // Don't pass a duration of 0! Makes the EBB DIE!
    if (duration == 0) duration = 1;

    // Save the duration state
    pen.lastDuration = duration;

    pen.x = point.x;
    pen.y = point.y;

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

    // Queue the final serial command
    run('move', {x: change.x, y: change.y}, duration);

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
      c = cmdstr('movexy', {d: duration, x: data.x, y: data.y});
      break;
    case 'height':
      // Send a new setup value for the the up position, then trigger "pen up"
      run('custom', cmdstr('movez', {z: data}));

      // If there's a togglez, run it after setting Z
      if (BOT.commands.togglez) {
        run('custom', cmdstr('togglez', {t: 0}));
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

  // Add final command and duration to end of queue
  buffer.unshift([c, duration]);
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
  // Don't continue execution if paused
  if (bufferPaused) return;

  if (buffer.length) {
    var cmd = buffer.pop();

    if (typeof cmd[0] === "function") {
      // Run custom callback in the queue. Timing for this should be correct
      // because of commandDuration below! (Here's hoping)
      cmd[0](1);
      executeNext();
    } else {
      // Set the duration of this command so when the board returns "OK",
      // will delay next command send
      commandDuration = Math.max(cmd[1] - gConf.get('bufferLatencyOffset'), 0);

      // Actually send the command out to serial
      serialCommand(cmd[0]);
    }

  } else {
    bufferRunning = false;
  }
}

// Buffer interval catcher, starts running the buffer as soon as items exist in it
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
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
    console.error('Error sending data: ' + data);
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
    console.log('Full Available Port Data:', ports);
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
      if (options.error) options.error('Port not found.');
    } else {
      console.log('Attempting to open serial port: "' + gConf.get('serialPath') + '"...');
      try {
        serialPort = new SerialPort(gConf.get('serialPath'), {
          baudrate : Number(botConf.get('baudRate')),
          parser: serialport.parsers.readline("\r")
        });

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
