/**
 * @file Abstraction module for watercolorbot specific stuff.
 */

// Exposed export.
const watercolorbot = {
  id: 'watercolorbot',
  paintDistance: 0,
  maxPaintDistance: 150, // 48.2 * 10,
};

module.exports = (cncserver) => {
  // Bot support in use parent callback.
  watercolorbot.checkInUse = (botConf) => {
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
    const start = { x: Number(cncserver.pen.state.x), y: Number(cncserver.pen.state.y) };
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

      cncserver.control.movePenAbs(point);

      i++;

      // Wiggle again!
      if (i <= iterations) {
        _wiggleSlave(!toggle);
      } else { // Done wiggling, go back to start
        cncserver.control.movePenAbs(start);
      }
    }

    // Start the wiggle!
    _wiggleSlave(true);
  };

  // Run a full wash in all the waters.
  watercolorbot.fullWash = () => {
    // TODO: Fix water0 overreach
    cncserver.control.setTool('water0dip');
    cncserver.control.setTool('water1');
    cncserver.control.setTool('water2');
  };

  // Reink with a water dip.
  watercolorbot.reink = (tool = cncserver.pen.state.tool) => {
    cncserver.control.setTool('water0dip');
    cncserver.control.setTool(tool);
  };

  // Bind the wiggle to the toolchange event.
  cncserver.binder.bindTo('tool.change', watercolorbot.id, (tool) => {
    // Only trigger this when the current tool isn't a wait.
    if (typeof tool.wait === 'undefined') {
      // Set the height based on what kind of tool it is.
      const downHeight = tool.name.indexOf('water') !== -1 ? 'wash' : 'draw';

      // Brush down
      cncserver.pen.setHeight(downHeight);

      // Wiggle the brush a bit
      watercolorbot.wigglePen(
        tool.wiggleAxis,
        tool.wiggleTravel,
        tool.wiggleIterations
      );

      // Put the pen back up when done!
      cncserver.pen.setHeight('up');

      // Reset paintDistance
      watercolorbot.paintDistance = 0;
    }
  });

  // Bind to begin of rendering path color group.
  cncserver.binder.bindTo('control.render.group.begin', watercolorbot.id, (colorID) => {
    watercolorbot.fullWash();
  });

  // Bind to end of rendering everything, wash that brush.
  cncserver.binder.bindTo('control.render.finish', watercolorbot.id, () => {
    watercolorbot.fullWash();
  });

  // Bind to path parsing for printing, allows for splitting paths to reink.
  cncserver.binder.bindTo('control.render.path.select', watercolorbot.id, (paths) => {
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
  cncserver.binder.bindTo('control.render.path.finish', watercolorbot.id, (path) => {
    watercolorbot.paintDistance += path.length;
    if (watercolorbot.paintDistance >= watercolorbot.maxPaintDistance - 1) {
      watercolorbot.reink();
    }
  });

  // Bind to color setdefault to set watercolors
  cncserver.binder.bindTo('colors.setDefault', watercolorbot.id, passthroughSet => (watercolorbot.inUse ? cncserver.drawing.colors.setFromPreset('generic-watercolor-generic') : passthroughSet));


  return watercolorbot;
};
