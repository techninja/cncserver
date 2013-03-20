/**
 * @file CNC Server for communicating with hardware via serial commands!
 * Supports EiBotBoart for Eggbot, Ostrich Eggbot and Sylvia's Super-Awesome
 * WaterColorBot
 *
 */

var arguments = process.argv.splice(2);
var port = arguments[0] ? arguments[0] : 4242;
var express = require('express');
var app = express();
var server = require('http').createServer(app);

// TODO: Interactively choose serialport
var SerialPort = require("serialport").SerialPort;
var serialPath = "/dev/ttyACM0";
var serialPort = new SerialPort(serialPath, { baudrate : 9600 });
var serialTimeout = 5000;

// CONFIGURE Data
config = {
  name: 'WaterColorBot',
  maxArea: {width: 12420, height: 7350}, // Size in steps
  workArea: {top: 0, left: 2850}, // Size in steps
  drawSpeed: 1000, // Drawing (brush down) speed in steps per second
  moveSpeed: 1500, // Moving (brush up) speed in steps per second
  tools: {
    water0: {
      x: 0,
      y: 0
    },
    water1: {
      x: 0,
      y: 2600
    },
    water2: {
      x: 0,
      y: 5500
    },
    color0: {
      x: 1700,
      y: 0
    },
    color1: {
      x: 1700,
      y: 950
    },
    color2: {
      x: 1700,
      y: 1950
    },
    color3: {
      x: 1700,
      y: 2900
    },
    color4: {
      x: 1700,
      y: 3700
    },
    color5: {
      x: 1700,
      y: 4650
    },
    color6: {
      x: 1700,
      y: 5550
    },
    color7: {
      x: 1700,
      y: 6450
    }
  }
};


// STATE Variables
var pen  = {
  x: 0, // Assume we start in top left corner
  y: 0,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  tool: 0
}

// Start express hosting the site from "webroot" folder on the given port
server.listen(port);
app.configure(function(){
  app.use("/", express.static(__dirname + '/webroot'));
  app.use(express.bodyParser());
});
console.log('CNC server listening on localhost:' + port);


console.log('Attempting to open serial port:' + serialPath);

// All serial requests are blocking to fetch returns
serialPort.on("open", function () {
  console.log('Serial connection open at 9600bps');

  // CNC Server API ============================================================
  // Return/Set PEN state  API =================================================
  app.all("/pen", function(req, res){
    res.set('Content-Type', 'application/json');

    if (req.route.method == 'get') {
      // GET pen state
      res.send(JSON.stringify(pen));
    } else if (req.route.method == 'put') {
      // SET/UPDATE pen state
      console.log('Set pen to:' + req.body.state);
      setPen(req.body, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: 'Error'
          }));
        } else {
          res.status(202).send(JSON.stringify(pen));
        }
      });
    } else if (req.route.method == 'delete'){
      // Reset pen to defaults (park)
      console.log('Parking Pen...');
      setPen({state: 0}, function(stat){
        setPen({x: 0, y:0, park: true}, function(stat){
          if (!stat) {
            res.status(500).send(JSON.stringify({
              status: 'Error'
            }));
          } else {
            res.status(200).send(JSON.stringify(pen));
          }
        });
      });
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  // Return/Set Motor state API ================================================
  app.all("/motors", function(req, res){
    res.set('Content-Type', 'application/json');

    console.log(req.route.method);

    // Disable/unlock motors
    // TODO: Find out why jQuery sends a GET for this...
    if (req.route.method == 'delete' || req.route.method == 'get') {
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
    } else {
      res.status(405).send(JSON.stringify({
        status: 'Not supported'
      }));
    }
  });

  // Get/Change Tool API ================================================
  app.all("/tools/:tool", function(req, res){
    res.set('Content-Type', 'application/json');

    // Pen Up
    setPen({state: 0}, function(){});

    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method == 'put') { // Set Tool
      if (config.tools[toolName]){
        setTool(toolName, function(data){
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

    console.log('Input val: ', inPen);

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
      console.log('Changed State! Writing to serial');
      // Flop state value on write
      serialCommand('SP,' + (pen.state == 1 ? 1 : 0), function(data){
        if (data) {
          pen.state = inPen.state;
        }

        callback(data);
      });

      return;
    }

    // Absolute positions are set
    if (inPen.x !== undefined){
      // Input values are given as percentages of working area (not max area)

      // TODO: verify incoming values

      // Convert the percentage values into real absolute and appropriate values
      var absInput = {
        x: config.workArea.left + ((inPen.x / 100) * (config.maxArea.width - config.workArea.left)),
        y: config.workArea.top + ((inPen.y / 100) * (config.maxArea.height - config.workArea.top))
      }

      if (inPen.park) {
        absInput.x-= config.workArea.left;
        absInput.y-= config.workArea.top;

        // Don't repark if already parked
        if (pen.x == 0 && pen.y == 0) {
          callback(false);
          return;
        }
      }

      console.log('Absolute pos: ', absInput)

      var change = {
        x: Math.round(absInput.x - pen.x),
        y: Math.round(absInput.y - pen.y)
      }

      console.log('Pos Change: ', change);

      var distance = Math.sqrt( Math.pow(change.x, 2) + Math.pow(change.y, 2));
      var speed = pen.state ? config.drawSpeed : config.moveSpeed;
      var duration = parseInt(distance / speed * 1000); // How many steps a second?


      console.log('Distance to move: ' + distance + ' steps');
      console.log('Time to Take: ' + duration + ' ms');

      // Flop X to match stepper command direction
      serialCommand('SM,' + duration + ',' + (change.x*-1) + ',' + change.y, function(data){
        if (data) {
          pen.x = absInput.x;
          pen.y = absInput.y;
        }

        // Can't trust this to callback when move is done, so trust duration
        if (inPen.ignoreTimeout == 1) {
          callback(data);
        } else {
          setTimeout(function(){
            callback(data);
          }, duration);
        }

      });
      return;
    }

    callback(true);
  }

  // Tool change
  function setTool(toolName, callback) {
    var tool = config.tools[toolName];

    console.log('Changing to tool: ' + toolName);

    var change = {
      x: Math.round(tool.x - pen.x),
      y: Math.round(tool.y - pen.y)
    }

    console.log('Pos Change: ', change);

    var distance = Math.sqrt( Math.pow(change.x, 2) + Math.pow(change.y, 2));
    var duration = parseInt(distance / config.moveSpeed * 1000); // How many steps a second?

    // Flop X to match stepper command direction
    serialCommand('SM,' + duration + ',' + (change.x*-1) + ',' + change.y, function(data){
      if (data) {
        pen.x = tool.x;
        pen.y = tool.y;
      }

      setTimeout(function(){
        callback(data);
      }, duration);

    });
  }

  function wigglePen(axis, travel, iterations){

  }

  // BLOCKING SERIAL READ/WRITE ================================================
  function serialCommand(command, callback){
    console.log('Executing serial command: ' + command);
    serialPort.write(command + "\r", function(err, results) {
      // TODO: Better Error Handling
      if (err) {
        // What kind of error is this anyways? :P
        console.log('err ' + err);
        if (callback) callback(false);
      }
      //console.log('results ' + results);
    });

    //var timedOut = false;
    //var to = setTimeout(function(){
    //  console.log('Serial Timed out on "' + command + '"')
      //timedOut = true;
    //  callback(false);
    //}, serialTimeout);

    // Catch the return data
    serialPort.on('data', function(data) {
      //clearTimeout(to);
      //if (!timedOut) {
        // TODO: Implement proper serial OK, EBB ERROR catch
        /*if (data && data.indexOf("Err") !== -1){
          console.log('Serial Error: ' + data);
          callback(false);
        }else{*/
          if (callback) callback(data);
        //}
      //}
    });
  }
});
