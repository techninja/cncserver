/**
 * @file Abstraction module for watercolorbot specific stuff.
 */
const watercolorbot = { id: 'watercolorbot' }; // Exposed export.

module.exports = (cncserver) => {
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
    }
  });

  return watercolorbot;
};
