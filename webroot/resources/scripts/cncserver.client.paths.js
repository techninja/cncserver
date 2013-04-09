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
  runOutline: function($path) {
    var run = cncserver.cmd.run;

    var steps = Math.round($path.maxLength / cncserver.config.precision) + 1;

    run([
      ['log', 'Drawing path ' + $path[0].id + ', ' + steps + ' total steps...'],
      'up'
    ]);

    // We can think of the very first brush down as waiting till we should paint
    cncserver.state.process.waiting = true;

    var i = 0;
    function runNextPoint() {
      if (i <= $path.maxLength) {
        i+= cncserver.config.precision;
        var p = $path.getPoint(i);

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
            run('up');
            cncserver.state.process.waiting = true;
          }
        }
        setTimeout(runNextPoint, 1);
      } else { // Done
        run([
          'up',
          'logdone'
        ]);
        console.log('Done!');
      }
    }

    runNextPoint();
  }
};
