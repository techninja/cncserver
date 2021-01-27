/**
 * @file CNC Server scratch support module.
 */
import * as pen from 'cs/pen';
import * as actualPen from 'cs/actualPen';
import * as utils from 'cs/utils';
import * as control from 'cs/control';
import * as tools from 'cs/tools';
import { bot, botConf, gConf } from 'cs/settings';
import run from 'cs/run';
import { sendPenUpdate } from 'cs/sockets';
import { createServerEndpoint } from 'cs/rest';
import * as buffer from 'cs/buffer';

const sizeMultiplier = 10; // Amount to increase size of steps
let turtle = {}; // Global turtle state object.

// Move request endpoint handler function
function moveRequest(req) {
  const url = req.originalUrl.split('.');

  const op = url[1];
  const { arg2 } = req.params;
  let { arg } = req.params;
  if (arg2 && !arg) {
    [, , arg] = url;
  }

  // Do nothing if sleeping
  if (turtle.sleeping) {
    // TODO: Do we care about running the math?
    return { code: 200, body: '' };
  }

  // Park
  if (req.url === '/park') {
    pen.setHeight('up');
    pen.setPen({
      x: bot.park.x,
      y: bot.park.y,
      park: true,
    });
    return { code: 200, body: '' };
  }

  // Arbitrary Wait
  if (op === 'wait') {
    arg = parseFloat(arg) * 1000;
    run('wait', false, arg);
    return { code: 200, body: '' };
  }

  // Speed setting
  if (op === 'speed') {
    arg = parseFloat(arg) * 10;
    botConf.set('speed:drawing', arg);
    botConf.set('speed:moving', arg);
  }

  // Rotating Pointer? (just rotate)
  if (op === 'left' || op === 'right') {
    arg = parseInt(arg, 10);
    turtle.degrees = op === 'right'
      ? turtle.degrees + arg
      : turtle.degrees - arg;

    if (turtle.degrees > 360) turtle.degrees -= 360;
    if (turtle.degrees < 0) turtle.degrees += 360;
    console.log(`Rotate ${op} ${arg} deg. to ${turtle.degrees} deg.`);
    return { code: 200, body: '' };
  }

  // Rotate pointer towards turtle relative X/Y
  if (op === 'toward') {
    const { workArea } = bot;

    // Convert input X/Y from scratch coordinates
    const point = {
      x: (parseInt(arg, 10) * sizeMultiplier) + workArea.absCenter.x,
      y: (-parseInt(arg2, 10) * sizeMultiplier) + workArea.absCenter.y,
    };

    const theta = Math.atan2(point.y - turtle.y, point.x - turtle.x);
    turtle.degrees = Math.round(theta * 180 / Math.PI);
    if (turtle.degrees > 360) turtle.degrees -= 360;
    if (turtle.degrees < 0) turtle.degrees += 360;

    console.log(`Rotate relative towards ${point.x}, ${point.y}
      from ${turtle.x}, ${turtle.y} to ${turtle.degrees} deg`);
    return { code: 200, body: '' };
  }

  // Rotate pointer directly
  if (op === 'absturn') {
    // Correct for "standard" Turtle orientation in Scratch.
    turtle.degrees = parseInt(arg, 10) - 90;
    console.log(
      `Rotate to ${arg} scratch degrees (actual angle ${turtle.degrees} deg)`
    );
    return { code: 200, body: '' };
  }

  // Simple Nudge X/Y
  if (op === 'nudge') {
    if (arg === 'y') {
      turtle[arg] += -1 * parseInt(arg2, 10) * sizeMultiplier;
    } else {
      turtle[arg] += parseInt(arg2, 10) * sizeMultiplier;
    }
  }

  // Move Pointer? Actually move!
  if (op === 'forward') {
    arg = parseInt(arg, 10);

    console.log(`Move pen by ${arg} steps`);
    const radians = turtle.degrees * (Math.PI / 180);
    turtle.x = Math.round(turtle.x + Math.cos(radians) * arg * sizeMultiplier);
    turtle.y = Math.round(turtle.y + Math.sin(radians) * arg * sizeMultiplier);
  }

  // Move x, y or both
  if (op === 'x' || op === 'y' || typeof req.params.x !== 'undefined') {
    arg = parseInt(arg, 10);

    if (op === 'x' || op === 'y') {
      turtle[op] = arg * sizeMultiplier;
    } else {
      // Word positions? convert to actual coordinates
      // X/Y swapped for "top left" arg positions.
      const wordX = ['left', 'center', 'right'].indexOf(req.params.y);
      const wordY = ['top', 'center', 'bottom'].indexOf(req.params.x);
      if (wordX > -1) {
        const steps = utils.centToSteps({
          x: (wordX / 2) * 100,
          y: (wordY / 2) * 100,
        });

        turtle.x = steps.x;
        turtle.y = steps.y;
      } else {
        // Convert input X/Y to steps via multiplier
        turtle.x = parseInt(req.params.x, 10) * sizeMultiplier;

        // In Scratch, positive Y is up on the page. :(
        turtle.y = -1 * parseInt(req.params.y, 10) * sizeMultiplier;

        // When directly setting XY position, offset by half for center 0,0
        turtle.x += bot.workArea.absCenter.x;
        turtle.y += bot.workArea.absCenter.y;
      }
    }

    console.log(`Move pen to coord ${turtle.x}, ${turtle.y}`);
  }

  // Attempt to move pen to desired point (may be off screen)
  const distance = control.movePenAbs(turtle);
  if (distance === 0) console.log('Not moved any distance');

  // Add up distance counter
  if ((pen.isDown()) && !pen.state.offCanvas) {
    turtle.distanceCounter = parseInt(
      Number(distance) + Number(turtle.distanceCounter),
      10
    );
  }

  // If reink initialized, check distance and initiate reink!
  if (turtle.reinkDistance > 0
    && turtle.distanceCounter > turtle.reinkDistance) {
    turtle.distanceCounter = 0;

    // Reink procedure!
    tools.changeTo('water0dip'); //  Dip in the water
    tools.changeTo(turtle.media); // Apply the last saved media
    control.movePenAbs(turtle); //    Move back to "current" position
    pen.setHeight('draw'); //     Set the position back to draw
  }

  return { code: 200, body: '' };
}

// General pen style request handler
function penRequest(req) {
  // Parse out the arguments as we can't use slashes in the URI(!?!)
  const url = req.originalUrl.split('.');
  let [, op, arg] = url;

  // Reset internal counter
  if (op === 'resetDistance') {
    turtle.distanceCounter = 0;
    return { code: 200, body: '' };
  }

  // Toggle sleep/simulation mode
  if (op === 'sleep') {
    arg = parseInt(arg, 10);
    turtle.sleeping = !!arg; // Convert integer to true boolean
    return { code: 200, body: '' };
  }

  // Do nothing if sleeping
  if (turtle.sleeping) {
    // TODO: Do we care about running the math?
    return { code: 200, body: '' };
  }

  // Set Pen up/down
  if (op === 'up' || op === 'down') {
    if (op === 'down') {
      op = 'draw';
    }

    // Don't set the height explicitly when off the canvas
    if (!pen.state.offCanvas) {
      pen.setHeight(op);
    } else {
      // Save the state for when we come back
      pen.forceState({ state: op });
    }
  }

  // Run simple wash
  if (op === 'wash') {
    tools.changeTo('water0');
    tools.changeTo('water1');
    tools.changeTo('water2');
  }

  // Turn off motors and zero to park pos
  if (op === 'off') {
    // Zero the assumed position
    const park = utils.centToSteps(bot.park, true);
    pen.forceState({ x: park.x, y: park.y });
    actualPen.forceState({ x: park.x, y: park.y });

    // You must zero FIRST then disable, otherwise actualPen is overwritten
    run('custom', 'EM,0,0');
    sendPenUpdate();
  }
  return { code: 200, body: '' };
}

// Tool Request Handler
function toolRequest(req) {
  const type = req.originalUrl.split('.')[1];

  // Do nothing if sleeping
  if (turtle.sleeping) {
    // TODO: Do we care about running the math?
    return { code: 200, body: '' };
  }

  // Set by ID (water/color)
  if (type) {
    const tool = type + parseInt(req.params.id, 10);
    tools.changeTo(tool);
    turtle.media = tool;
  }

  return { code: 200, body: '' };
}

export function initAPI() {
  const pollData = {}; // "Array" of "sensor" data to be spat out to poll page
  turtle = { // Helper turtle for relative movement
    x: bot.workArea.absCenter.x,
    y: bot.workArea.absCenter.y,
    limit: 'workArea',
    sleeping: false,
    reinkDistance: 0,
    media: 'water0',
    degrees: 0,
    distanceCounter: 0,
  };

  pollData.render = function renderData() {
    let out = '';

    const { workArea } = bot;

    out += `x ${(turtle.x - workArea.absCenter.x) / sizeMultiplier}\n`;
    out += `y ${(turtle.y - workArea.absCenter.y) / sizeMultiplier}\n`;
    out += `z ${pen.isDown() ? '1' : '0'}\n`;

    // Correct for "standard" Turtle orientation in Scratch
    let angleTemp = turtle.degrees + 90;
    if (angleTemp > 360) {
      angleTemp -= 360;
    }

    out += `angle ${angleTemp}\n`;
    out += `distanceCounter ${turtle.distanceCounter / sizeMultiplier}\n`;
    out += `sleeping ${turtle.sleeping ? '1' : '0'}\n`;

    // Loop through all existing/static pollData
    // TODO: Fix this from original source, this is just wrong :/
    /* out += Object.keys(pollData).reduce(
      (line, key) => `${line}${key} ${pollData[key].join(' ')}\n`
    ); */

    // Throw in full pen data as well
    for (const [key, value] of Object.entries(pen.state)) {
      if (key !== 'x' && key !== 'y' && key !== 'distanceCounter') {
        out += `${key} ${value}\n`;
      }
    }
    return out;
  };

  // Helper function to add/remove busy watchers
  // TODO: Not fully implemented as performance is better without waiting.
  pollData.busy = (id, destroy) => {
    if (!pollData._busy) {
      pollData._busy = []; // Add busy placeholder
    }

    const index = pollData._busy.indexOf(id);

    if (destroy && index > -1) { // Remove
      pollData._busy.splice(index, 1);
    } else if (!destroy && index === -1) { // Add!
      pollData._busy.push(id);
    }
  };

  // SCRATCH v2 Specific endpoints =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
  // Central poll returner (Queried ~30hz)
  createServerEndpoint('/poll', () => (
    { code: 200, body: pollData.render() }
  ));

  // Flash crossdomain helper
  createServerEndpoint('/crossdomain.xml', () => ({
    code: 200,
    body:
      `<?xml version="1.0" ?><cross-domain-policy>\
      <allow-access-from domain="*" \
      to-ports="${gConf.get('httpPort')}\
      "/></cross-domain-policy>`,
  }));

  // Initialize/reset status
  createServerEndpoint('/reset_all', () => {
    turtle = { // Reset to default
      x: bot.workArea.absCenter.x,
      y: bot.workArea.absCenter.y,
      limit: 'workArea', // Limits movements to bot work area
      sleeping: false,
      media: 'water0',
      reinkDistance: 0,
      degrees: 0,
      distanceCounter: 0,
    };

    // Clear Run Buffer
    // @see /v1/buffer/ DELETE
    buffer.clear();

    pollData._busy = []; // Clear busy indicators
    return { code: 200, body: '' };
  });

  // SCRATCH v2 Specific endpoints =^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=-=^=

  // Move Endpoint(s)
  createServerEndpoint('/park', moveRequest);
  createServerEndpoint('/coord/:x/:y', moveRequest);
  createServerEndpoint('/move.forward./:arg', moveRequest);
  createServerEndpoint('/move.wait./:arg', moveRequest);
  createServerEndpoint('/move.right./:arg', moveRequest);
  createServerEndpoint('/move.left./:arg', moveRequest);
  createServerEndpoint('/move.absturn./:arg', moveRequest);
  createServerEndpoint('/move.toward./:arg/:arg2', moveRequest);
  createServerEndpoint('/move.speed./:arg', moveRequest);

  createServerEndpoint('/move.nudge.x./:arg2', moveRequest);
  createServerEndpoint('/move.nudge.y./:arg2', moveRequest);

  // Reink initialization endpoint
  createServerEndpoint('/penreink/:distance', req => {
    // 167.7 = 1.6mm per step * 100 mm per cm (as input)
    const cm = parseFloat(req.params.distance);
    turtle.reinkDistance = Math.round(cm * 167.7);
    console.log('Reink distance: ', turtle.reinkDistance);
    return { code: 200, body: '' };
  });

  // Stop Reinking endpoint
  createServerEndpoint('/penstopreink', () => {
    turtle.reinkDistance = 0;
    console.log('Reink distance: ', turtle.reinkDistance);
    return { code: 200, body: '' };
  });

  // Pen endpoints
  createServerEndpoint('/pen', penRequest);
  createServerEndpoint('/pen.wash', penRequest);
  createServerEndpoint('/pen.up', penRequest);
  createServerEndpoint('/pen.down', penRequest);
  createServerEndpoint('/pen.off', penRequest);
  createServerEndpoint('/pen.resetDistance', penRequest);
  createServerEndpoint('/pen.sleep.1', penRequest);
  createServerEndpoint('/pen.sleep.0', penRequest);

  // Tool set endpoints
  createServerEndpoint('/tool.color./:id', toolRequest);
  createServerEndpoint('/tool.water./:id', toolRequest);
}
