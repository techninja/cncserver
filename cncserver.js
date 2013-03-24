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
var colorX = 1300;
config = {
  name: 'WaterColorBot',
  maxArea: {width: 12420, height: 7350}, // Size in steps
  workArea: {top: 0, left: 2450}, // Size in steps
  drawSpeed: 2000, // Drawing (brush down) speed in steps per second
  moveSpeed: 3000, // Moving (brush up) speed in steps per second
  servo: {
    min: 12900, // Brush Lift amount (lower number lifts higher)
    max: 25000,  // Brush fall (servo arm stays clear)
    speed: 720 // AMount of time a full movement takes
  },
  tools: {
    water0: {
      x: 0,
      y: 0,
      wiggleAxis: 'y',
      wiggleTravel: 500
    },
    water1: {
      x: 0,
      y: 3050,
      wiggleAxis: 'y',
      wiggleTravel: 500
    },
    water2: {
      x: 0,
      y: 5800,
      wiggleAxis: 'y',
      wiggleTravel: 500
    },
    color0: {
      x: colorX,
      y: 0,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color1: {
      x: colorX,
      y: 1200,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color2: {
      x: colorX,
      y: 2150,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color3: {
      x: colorX,
      y: 3100,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color4: {
      x: colorX,
      y: 3900,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color5: {
      x: colorX,
      y: 4900,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color6: {
      x: colorX,
      y: 5800,
      wiggleAxis: 'x',
      wiggleTravel: 300
    },
    color7: {
      x: colorX,
      y: 6700,
      wiggleAxis: 'x',
      wiggleTravel: 300
    }
  }
};


// STATE Variables
var pen  = {
  x: 0, // Assume we start in top left corner
  y: 0,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  tool: 0,
  distanceCounter: 0 // Holds a running tally of distance travelled
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

  // Set initial EBB values from Config
  // SERVO
  serialCommand('SC,4,' + config.servo.min);
  serialCommand('SC,5,' + config.servo.max);

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

    // Counter Reset
    if (inPen.resetCounter) {
      pen.distanceCounter = 0;
      callback(true);
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
          }, config.servo.speed);
        }
      });

      return;
    }

    // Absolute positions are set
    if (inPen.x !== undefined){
      // Input values are given as percentages of working area (not max area)

      // Sanity check incoming values
      inPen.x  = inPen.x > 100 ? 100 : inPen.x;
      inPen.x  = inPen.x < 0 ? 0 : inPen.x;

      inPen.y  = inPen.y > 100 ? 100 : inPen.y;
      inPen.y  = inPen.y < 0 ? 0 : inPen.y;

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

      // Actually move the pen!
      var distance = movePenAbs(absInput, callback, inPen.ignoreTimeout);
      if (pen.state) {
        pen.distanceCounter+= distance;
      }
      return;
    }

    if (callback) callback(true);
  }

  // Tool change
  function setTool(toolName, callback) {
    var tool = config.tools[toolName];

    console.log('Changing to tool: ' + toolName);

    // Pen Up
    setPen({state: 0}, function(){
      // Move to the tool
      movePenAbs(tool, function(data){
        // Pen down
        setPen({state: 1}, function(){
          // Wiggle the brush a bit
          wigglePen(tool.wiggleAxis, tool.wiggleTravel, 3, function(){
            callback(data);
          });
        });
      });
    });
  }

  // Move the Pen to an absolute point in the entire work area
  // Returns distance moved, in steps
  function movePenAbs(point, callback, immediate) {
    // Sanity check absolute position input point
    point.x = point.x > config.maxArea.width ? config.maxArea.width : point.x;
    point.x = point.x < 0 ? 0 : point.x;

    point.y = point.y > config.maxArea.height ? height : point.y;
    point.y = point.y < 0 ? 0 : point.y;

    //console.log('Absolute pos: ', point)

    var change = {
      x: Math.round(point.x - pen.x),
      y: Math.round(point.y - pen.y)
    }

    // Don't do anything if there's no change
    if (change.x == 0 && change.y == 0) {
      callback(false);
      return;
    }

    console.log('Pos Change: ', change);

    var distance = Math.sqrt( Math.pow(change.x, 2) + Math.pow(change.y, 2));
    var speed = pen.state ? config.drawSpeed : config.moveSpeed;
    var duration = parseInt(distance / speed * 1000); // How many steps a second?

    //console.log('Distance to move: ' + distance + ' steps');
    //console.log('Time to Take: ' + duration + ' ms');

    pen.x = point.x;
    pen.y = point.y;

    // Send the final serial command
    // Flop X to match stepper command direction
    serialCommand('SM,' + duration + ',' + (change.x*-1) + ',' + change.y, function(data){
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
    var start = {x: pen.x, y: pen.y};
    var i = 0;

    // Start the wiggle!
    _wiggleSlave(true);

    function _wiggleSlave(toggle){
      var point = {x: start.x, y: start.y};
      point[axis]+= (toggle ? travel : travel * -1);
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
    serialPort.write(command + "\r", function(err, results) {
      // TODO: Better Error Handling
      if (err) {
        // What kind of error is this anyways? :P
        console.log('err ' + err);
        if (callback) callback(false);
      } else {
        // This is terrible, but.. you can NOT trust the data return
        if (callback) callback(true);
      }
    });

    // Catch the return data
    serialPort.on('data', function(data) {
      // Do nothing as the EBB gives utterly unhelpful data for non-blocking applications
    });
  }
});
