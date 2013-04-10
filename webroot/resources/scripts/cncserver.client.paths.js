/**
 * @file Holds all CNC Server path management and tracing functions
 */

cncserver.paths = {
  // Find out what DOM object is directly below the point given
  // Will NOT work if point is outside visible screen range!
  getPointPathCollide: function(point) {
    return document.elementFromPoint(
      (point.x * cncserver.canvas.scale) + cncserver.canvas.offset.left,
      (point.y * cncserver.canvas.scale) + cncserver.canvas.offset.top
    );
  },

  // Run a path outline trace into the work queue
  runOutline: function($path, callback) {
    var run = cncserver.cmd.run;

    var steps = Math.round($path.maxLength / cncserver.config.precision) + 1;

    run([
      ['log', 'Drawing path ' + $path[0].id + ' outline, ' + steps + ' total steps...'],
      'up'
    ]);

    // We can think of the very first brush down as waiting till we should paint
    cncserver.state.process.waiting = true;

    var i = 0;
    var lastPoint = {};
    var p = {};
    var delta = {};

    runNextPoint();

    function runNextPoint() {
      if (i <= $path.maxLength) {
        i+= cncserver.config.precision;

        lastPoint = {x:p.x, y:p.y}; // Store the last run point
        p = $path.getPoint(i); // Get a new point
        delta = {x:lastPoint.x - p.x, y: lastPoint.y - p.y} // Store the difference

        // If the path is still visible here
        if (cncserver.paths.getPointPathCollide(p) == $path[0]){
          // Move to point!
          run('move', p);

          // If we were waiting, pen goes down
          if (cncserver.state.process.waiting) {
            run('down');
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            // Figure out how much change since last point, move more before lifting
            if (delta.x || delta.y) {
              var o = {x: p.x - (delta.x * 5), y: p.y - (delta.y * 5)};
              run('move', o); // Overshoot to make up for brush flexibility
            }

            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        setTimeout(runNextPoint, 1);
      } else { // Done
        // Figure out how much change since last point, move more before lifting
        if (delta.x || delta.y) {
          var o = {x: p.x - (delta.x * 5), y: p.y - (delta.y * 5)};
          run('move', o); // Overshoot to make up for brush flexibility
        }

        run([
          'up',
          'logdone'
        ]);
        console.info($path[0].id + ' path outline run done!');
        if (callback) callback();
      }
    }
  },

  // Run a full path fill into the buffer
  runFill: function($path, callback) {
    var run = cncserver.cmd.run;
    var pathRect = $path[0].getBBox();
    var $fill = cncserver.config.fillPath;

    run([
      ['log', 'Filling path ' + $path[0].id + ', spiral fill...'],
      'up'
    ]);

    cncserver.state.process.waiting = true;

    var center = {
      x: pathRect.x + (pathRect.width / 2),
      y: pathRect.y + (pathRect.height / 2)
    }

    // Center the fill path
    $fill.attr('transform', 'translate(' + center.x + ',' + center.y + ')');

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x, y: p.y};
    };

    var i = 0;
    var p = {};
    var max = $fill[0].getTotalLength();
    runNextFill();

    function runNextFill() {
      i+= cncserver.config.precision * 2;
      p = $fill.getPoint(i);

      // Spiral is outside top left, and therefore can never return
      if (p.x < pathRect.x && p.y < pathRect.y ) i = max;

      // Spiral is outside bottom right, and therefore can never return
      if (p.x > pathRect.x + pathRect.width && p.y > pathRect.y + pathRect.height) i = max;

      if (i < max) {
        // If the path is still visible here
        if (cncserver.paths.getPointPathCollide(p) == $path[0]){
          // Move to point!
          run('move', p);

          // If we were waiting, pen goes down
          if (cncserver.state.process.waiting) {
            run('down');
            cncserver.state.process.waiting = false;
          }
        } else { // Path is invisible, lift the brush if we're not already waiting
          if (!cncserver.state.process.waiting) {
            run('move', $fill.getPoint(i+5));
            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        setTimeout(runNextFill, 1);
      } else { // Done
        run([
          'up',
          'logdone'
        ]);
        console.info($path[0].id + ' path fill run done!');
        if (callback) callback();
      }
    }
  }
};
