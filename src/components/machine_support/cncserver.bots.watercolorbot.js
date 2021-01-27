/**
 * @file Abstraction module for watercolorbot specific stuff.
 */
import { bindTo } from 'cs/binder';
import * as pen from 'cs/pen';
import * as control from 'cs/control';
import * as tools from 'cs/tools';
import { getColorID } from 'cs/drawing/base';
import { getPreset } from 'cs/utils';

// Exposed export.
const watercolorbot = {
  id: 'bots.watercolorbot',
  paintDistance: 0,
  maxPaintDistance: 150, // 48.2 * 10,
};

/**
 * Initialize bot specific code.
 *
 * @export
 */
export default function initBot() {
  // Bot support in use parent callback.
  watercolorbot.checkInUse = botConf => {
    watercolorbot.inUse = botConf.name === 'WaterColorBot';
  };

  /**
   * Util function to buffer the "wiggle" movement for WaterColorBot Tool
   * changes.
   *
   * @param {string} axis
   *   Which axis to move along. Either 'xy' or 'y'
   * @param {integer} rawTravel
   *   How much to move during the wiggle.
   * @param {integer} iterations
   *   How many times to move.
   */
  watercolorbot.wigglePen = (axis, rawTravel, iterations) => {
    const start = { x: Number(pen.state.x), y: Number(pen.state.y) };
    let i = 0;
    const travel = Number(rawTravel); // Make sure it's not a string

    function _wiggleSlave(toggle) {
      const point = { x: start.x, y: start.y };

      if (axis === 'xy') {
        const rot = i % 4; // Ensure rot is always 0-3

        // This convoluted series ensure the wiggle moves in a proper diamond
        if (rot % 3) { // Results in F, T, T, F
          if (toggle) {
            point.y += travel / 2; // Down
          } else {
            point.x -= travel; // Left
          }
        }

        if (toggle) {
          point.y -= travel / 2; // Up
        } else {
          point.x += travel; // Right
        }
      } else {
        point[axis] += (toggle ? travel : travel * -1);
      }

      control.movePenAbs(point);

      i++;

      // Wiggle again!
      if (i <= iterations) {
        _wiggleSlave(!toggle);
      } else { // Done wiggling, go back to start
        control.movePenAbs(start);
      }
    }

    // Start the wiggle!
    _wiggleSlave(true);
  };

  // Run a full wash in all the waters.
  watercolorbot.fullWash = () => {
    // TODO: Fix water0 overreach
    tools.changeTo('water0dip');
    tools.changeTo('water1');
    tools.changeTo('water2');
  };

  // Reink with a water dip.
  watercolorbot.reink = (tool = pen.state.tool) => {
    tools.changeTo('water0dip');
    tools.changeTo(tool);
  };

  // Bind the wiggle to the toolchange event.
  bindTo('tool.change', 'watercolorbot', tool => {
    // Only trigger this when the current tool isn't a wait.
    if (typeof tool.wait === 'undefined') {
      // Set the height based on what kind of tool it is.
      const downHeight = tool.name.indexOf('water') !== -1 ? 'wash' : 'draw';

      // Brush down
      pen.setHeight(downHeight);

      // Wiggle the brush a bit
      watercolorbot.wigglePen(
        tool.wiggleAxis,
        tool.wiggleTravel,
        tool.wiggleIterations
      );

      // Put the pen back up when done!
      pen.setHeight('up');

      // Reset paintDistance
      watercolorbot.paintDistance = 0;
    }
  });

  // Bind to begin of rendering path color group.
  bindTo('control.render.group.begin', watercolorbot.id, (colorID) => {
    watercolorbot.fullWash();
  });

  // Bind to end of rendering everything, wash that brush.
  bindTo('control.render.finish', watercolorbot.id, () => {
    watercolorbot.fullWash();
  });

  // Bind to path parsing for printing, allows for splitting paths to reink.
  bindTo('control.render.path.select', watercolorbot.id, paths => {
    // Only trigger this when WCB is in use.
    // TODO: don't trigger this for non reinking implements 😬
    if (watercolorbot.inUse) {
      // Destructuring these separates the connection, so we can virtually act
      // on them withotu changing them as the path selection process is BEFORE
      // rendering to accell moves.
      let { paintDistance } = watercolorbot;
      const { maxPaintDistance } = watercolorbot;
      let path = paths[paths.length - 1];

      paintDistance += path.length;
      // console.log('Paint line length', Math.round(path.length));
      while (paintDistance > maxPaintDistance) {
        const diff = paintDistance - maxPaintDistance;
        // console.log('Splitting path, with next path at', Math.round(path.length - diff));

        // Split the path to the remaining size, plus 1 mm.
        path = path.splitAt(path.length - diff);

        // Add new remainder path back to the list after the current one.
        paths.push(path);

        // Set distance to difference for next loop (if any).
        paintDistance = diff;
      }

      /* console.log('Final paths to be drawn:');
      paths.forEach((item) => {
        console.log(item.length);
      }); */
    }

    return paths;
  });

  // Bind to render path complete, to trigger reinking as needed
  bindTo('control.render.path.finish', watercolorbot.id, path => {
    watercolorbot.paintDistance += path.length;
    if (watercolorbot.paintDistance >= watercolorbot.maxPaintDistance - 1) {
      watercolorbot.reink(getColorID(path));
    }
  });

  // Bind to color setdefault to set watercolors
  bindTo('colors.setDefault', watercolorbot.id, passthroughSet => (
    watercolorbot.inUse
      ? getPreset('colorsets', 'generic-watercolor-generic')
      : passthroughSet
  ));

  return watercolorbot;
};
