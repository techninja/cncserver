/*jslint node: true */
'use strict';

/**
 * @file CNC Server scratch support module
 */
var cncserver = {}; // Set only when the API is initialized.
var turtle = {};
var sizeMultiplier = 10; // Amount to increase size of steps

exports.initAPI = function(cncserverArg) {
  cncserver = cncserverArg;
  console.info('Scratch v2 Programming support ENABLED');
  var pollData = {}; // "Array" of "sensor" data to be spat out to poll page
  turtle = { // Helper turtle for relative movement
    x: cncserver.bot.workArea.absCenter.x,
    y: cncserver.bot.workArea.absCenter.y,
    limit: 'workArea',
    sleeping: false,
    reinkDistance: 0,
    media: 'water0',
    degrees: 0,
    distanceCounter: 0
  };

  pollData.render = function() {
    var out = "";

    out += 'x ' + (turtle.x - cncserver.bot.workArea.absCenter.x) / sizeMultiplier  + "\n";
    out += 'y ' + (turtle.y - cncserver.bot.workArea.absCenter.y) / sizeMultiplier + "\n";
    out += 'z ' + ((cncserver.pen.state === 'draw' || cncserver.pen.state === 1) ? '1' : '0') + "\n";

    var angleTemp = turtle.degrees + 90; // correct for "standard" Turtle orientation in Scratch
    if (angleTemp > 360) {
      angleTemp -= 360;
    }
    out += 'angle ' + angleTemp + "\n";
    out += 'distanceCounter ' + turtle.distanceCounter / sizeMultiplier + "\n";
    out += 'sleeping ' + (turtle.sleeping ? '1' : '0')  + "\n";

    // Loop through all existing/static pollData
    var key = "";
    for (key in this) {
      if (typeof this[key] === 'object') {
        var v = (typeof this[key] === 'string') ?  this[key] : this[key].join(' ');

        if (v !== '') {
          out += key + ' ' + v + "\n";
        }
      }
    }

    // Throw in full pen data as well
    for (key in cncserver.pen) {
      if (key === 'x') {}
      else if (key === 'y') {}
      else if (key === 'distanceCounter') {}
      else {
        out += key + ' ' + cncserver.pen[key] + "\n";
      }
    }
    return out;
  };

  // Helper function to add/remove busy watchers
  // TODO: Not fully implemented as performance is better without waiting.
  pollData.busy = function(id, destroy) {
    if (!pollData._busy) pollData._busy = []; // Add busy placeholder)

    var index = pollData._busy.indexOf(id);

    if (destroy && index > -1) { // Remove
      pollData._busy.splice(index, 1);
    } else if (!destroy && index === -1) { // Add!
      pollData._busy.push(id);
    }
  };


  // SCRATCH v2 Specific endpoints =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
  // Central poll returner (Queried ~30hz)
  cncserver.createServerEndpoint("/poll", function(req, res){
    return {code: 200, body: pollData.render()};
  });

  // Flash crossdomain helper
  cncserver.createServerEndpoint("/crossdomain.xml", function(req, res){
    return {code: 200, body: '<?xml version="1.0" ?><cross-domain-policy><allow-access-from domain="*" to-ports="' + cncserver.gConf.get('httpPort') + '"/></cross-domain-policy>'};
  });

  // Initialize/reset status
  cncserver.createServerEndpoint("/reset_all", function(req, res){
    turtle = { // Reset to default
      x: cncserver.bot.workArea.absCenter.x,
      y: cncserver.bot.workArea.absCenter.y,
      limit: 'workArea', // Limits movements to bot work area
      sleeping: false,
      media: 'water0',
      reinkDistance: 0,
      degrees: 0,
      distanceCounter: 0
    };

    // Clear Run Buffer
    // @see /v1/buffer/ DELETE
    cncserver.clearBuffer();
    cncserver.sendBufferComplete();

    pollData._busy = []; // Clear busy indicators
    return {code: 200, body: ''};
  });

  // SCRATCH v2 Specific endpoints =^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=

  // Move Endpoint(s)
  cncserver.createServerEndpoint("/park", moveRequest);
  cncserver.createServerEndpoint("/coord/:x/:y", moveRequest);
  cncserver.createServerEndpoint("/move.forward./:arg", moveRequest);
  cncserver.createServerEndpoint("/move.wait./:arg", moveRequest);
  cncserver.createServerEndpoint("/move.right./:arg", moveRequest);
  cncserver.createServerEndpoint("/move.left./:arg", moveRequest);
  cncserver.createServerEndpoint("/move.absturn./:arg", moveRequest);
  cncserver.createServerEndpoint("/move.toward./:arg/:arg2", moveRequest);
  cncserver.createServerEndpoint("/move.speed./:arg", moveRequest);

  cncserver.createServerEndpoint("/move.nudge.x./:arg2", moveRequest);
  cncserver.createServerEndpoint("/move.nudge.y./:arg2", moveRequest);

  // Reink initialization endpoint
  cncserver.createServerEndpoint("/penreink/:distance", function(req, res) {
    // 167.7 = 1.6mm per step * 100 mm per cm (as input)
    var cm = parseFloat(req.params.distance);
    turtle.reinkDistance = Math.round(req.params.distance * 167.7);
    console.log('Reink distance: ', turtle.reinkDistance);
    return {code: 200, body: ''};
  });


  // Stop Reinking endpoint
  cncserver.createServerEndpoint("/penstopreink", function(req, res) {
    turtle.reinkDistance = 0;
    console.log('Reink distance: ', turtle.reinkDistance);
    return {code: 200, body: ''};
  });

  // Pen endpoints
  cncserver.createServerEndpoint("/pen", penRequest);
  cncserver.createServerEndpoint("/pen.wash", penRequest);
  cncserver.createServerEndpoint("/pen.up", penRequest);
  cncserver.createServerEndpoint("/pen.down", penRequest);
  cncserver.createServerEndpoint("/pen.off", penRequest);
  cncserver.createServerEndpoint("/pen.resetDistance", penRequest);
  cncserver.createServerEndpoint("/pen.sleep.1", penRequest);
  cncserver.createServerEndpoint("/pen.sleep.0", penRequest);

  // Tool set endpoints
  cncserver.createServerEndpoint("/tool.color./:id", toolRequest);
  cncserver.createServerEndpoint("/tool.water./:id", toolRequest);
};

// Move request endpoint handler function
function moveRequest(req, res){
  //pollData.busy(req.params.busyid);
  var url = req.originalUrl.split('.');

  var op = url[1];
  var arg = req.params.arg;
  var arg2 = req.params.arg2;
  if (req.params.arg2 && !req.params.arg) {
    arg = url[2];
  }

  // Do nothing if sleeping
  if (turtle.sleeping) {
    // TODO: Do we care about running the math?
    return {code: 200, body: ''};
  }

  // Park
  if (req.url === '/park') {
    cncserver.setHeight('up');
    cncserver.setPen({x: cncserver.bot.park.x, y: cncserver.bot.park.y, park: true});
    return {code: 200, body: ''};
  }

  // Arbitrary Wait
  if (op === 'wait') {
    arg = parseFloat(arg) * 1000;
    cncserver.run('wait', false, arg);
    return {code: 200, body: ''};
  }

  // Speed setting
  if (op === 'speed') {
    arg = parseFloat(arg) * 10;
    cncserver.botConf.set('speed:drawing', arg);
    cncserver.botConf.set('speed:moving', arg);
  }

  // Rotating Pointer? (just rotate)
  if (op === 'left' || op === 'right') {
    arg = parseInt(arg);
    turtle.degrees = (op === 'right' ? turtle.degrees + arg : turtle.degrees - arg);
    if (turtle.degrees > 360) turtle.degrees -= 360;
    if (turtle.degrees < 0) turtle.degrees += 360;
    console.log('Rotate ' + op + ' ' + arg + ' deg. to ' + turtle.degrees + ' deg.');
    return {code: 200, body: ''};
  }

  // Rotate pointer towards turtle relative X/Y
  if (op === 'toward') {
    // Convert input X/Y from scratch coordinates
    var point = {
      x: (parseInt(arg) * sizeMultiplier) + cncserver.bot.workArea.absCenter.x,
      y: (-parseInt(arg2) * sizeMultiplier) + cncserver.bot.workArea.absCenter.y
    };

    var theta = Math.atan2(point.y - turtle.y, point.x - turtle.x);
    turtle.degrees = Math.round(theta * 180 / Math.PI);
      if (turtle.degrees > 360) turtle.degrees -= 360;
      if (turtle.degrees < 0) turtle.degrees += 360;

    console.log('Rotate relative towards ' + point.x + ',' + point.y + ' from', turtle.x  + ', ' + turtle.y, 'to', turtle.degrees, 'deg');
    return {code: 200, body: ''};
  }

  // Rotate pointer directly
  if (op === 'absturn') {
    turtle.degrees = parseInt(arg) - 90; // correct for "standard" Turtle orientation in Scratch
    console.log('Rotate to', arg, 'scratch degrees', '(actual angle ' + turtle.degrees + 'deg)');
    return {code: 200, body: ''};
  }

  // Simple Nudge X/Y
  if (op === 'nudge') {
    if (arg === 'y') {
      turtle[arg] += -1 * parseInt(arg2) * sizeMultiplier;
    } else {
      turtle[arg] += parseInt(arg2) * sizeMultiplier;
    }
  }

  // Move Pointer? Actually move!
  if (op === 'forward') {
    arg = parseInt(arg);

    console.log('Move pen by ' + arg + ' steps');
    var radians = turtle.degrees * (Math.PI / 180);
    turtle.x = Math.round(turtle.x + Math.cos(radians) * arg * sizeMultiplier);
    turtle.y = Math.round(turtle.y + Math.sin(radians) * arg * sizeMultiplier);
  }

  // Move x, y or both
  if (op === 'x' || op === 'y' || typeof req.params.x !== 'undefined') {
    arg = parseInt(arg);

    if (op === 'x' || op === 'y') {
      turtle[op] = arg * sizeMultiplier;
    } else {

      // Word positions? convert to actual coordinates
      var wordX = ['left', 'center', 'right'].indexOf(req.params.y); // X/Y swapped for "top left" arg positions
      var wordY = ['top', 'center', 'bottom'].indexOf(req.params.x);
      if (wordX > -1) {
        var steps = cncserver.centToSteps({x: (wordX / 2) * 100, y: (wordY / 2) * 100});
        turtle.x = steps.x;
        turtle.y = steps.y;
      } else {
        // Convert input X/Y to steps via multiplier
        turtle.x = parseInt(req.params.x) * sizeMultiplier;
        turtle.y = -1 * parseInt(req.params.y) * sizeMultiplier;  // In Scratch, positive Y is up on the page. :(

        // When directly setting XY position, offset by half for center 0,0
        turtle.x+= cncserver.bot.workArea.absCenter.x;
        turtle.y+= cncserver.bot.workArea.absCenter.y;
      }
    }

    console.log('Move pen to coord ' + turtle.x + ' ' + turtle.y);
  }

  // Attempt to move pen to desired point (may be off screen)
  var distance = cncserver.movePenAbs(turtle);
  if (distance === 0) console.log('Not moved any distance');

  // Add up distance counter
  if ((cncserver.penDown()) && !cncserver.pen.offCanvas) {
    turtle.distanceCounter = parseInt(Number(distance) + Number(turtle.distanceCounter));
  }

  // If reink initialized, check distance and initiate reink!
  if (turtle.reinkDistance > 0 && turtle.distanceCounter > turtle.reinkDistance) {
    turtle.distanceCounter = 0;

    // Reink procedure!
    cncserver.setTool('water0dip');   // Dip in the water
    cncserver.setTool(turtle.media);  // Apply the last saved media
    cncserver.movePenAbs(turtle);     // Move back to "current" position
    cncserver.setHeight('draw');      // Set the position back to draw
  }

  return {code: 200, body: ''};
}

// General pen style request handler
function penRequest(req, res){
  // Parse out the arguments as we can't use slashes in the URI(!?!)
  var url = req.originalUrl.split('.');
  var op = url[1];
  var arg = url[2];

  // Reset internal counter
  if (op === 'resetDistance') {
    turtle.distanceCounter = 0;
    return {code: 200, body: ''};
  }

  // Toggle sleep/simulation mode
  if (op === 'sleep') {
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
  if (op === 'up' || op === "down") {
    if (op === 'down') {
      op = 'draw';
    }

    // Don't set the height explicitly when off the canvas
    if (!cncserver.pen.offCanvas) {
      cncserver.setHeight(op);
    } else {
      // Save the state for when we come back
      cncserver.pen.state = op;
    }
  }

  // Run simple wash
  if (op === 'wash'){
    cncserver.setTool('water0');
    cncserver.setTool('water1');
    cncserver.setTool('water2');
  }

  // Turn off motors and zero to park pos
  if (op === 'off'){
    // Zero the assumed position
    var park = cncserver.centToSteps(cncserver.bot.park, true);
    cncserver.pen.x = park.x;
    cncserver.pen.y = park.y;
    cncserver.actualPen.x = park.x;
    cncserver.actualPen.y = park.y;

    // You must zero FIRST then disable, otherwise actualPen is overwritten
    cncserver.run('custom', 'EM,0,0');
    cncserver.sendPenUpdate();
  }
  return {code: 200, body: ''};
}

// Tool Request Handler
function toolRequest(req, res) {
  var type = req.originalUrl.split('.')[1];

  // Do nothing if sleeping
  if (turtle.sleeping) {
    // TODO: Do we care about running the math?
    return {code: 200, body: ''};
  }

  // Set by ID (water/color)
  if (type) {
    var tool = type + parseInt(req.params.id);
    cncserver.setTool(tool);
    turtle.media = tool;
  }

  return {code: 200, body: ''};
}
