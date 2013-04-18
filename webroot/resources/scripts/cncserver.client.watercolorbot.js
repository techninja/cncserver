/**
 * @file Holds all CNC Server watercolorbot specific configuration
 */

cncserver.wcb = {

  // Move through every path element inside a given context
  // and match its stroke and fill color to a given colorset
  autoColor: function(context, recover){
    $('path', context).each(function(){
      var i = 0;
      var c = cncserver.config.colors;
      var setColor = "";

      if ($(this).css('fill') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('fill');
          $(this).data('oldColor', setColor);
          i = cncserver.utils.closestColor(setColor);
          setColor = 'rgb(' + c[i].join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldColor');
        }

        // Set the new color!
        $(this).css('fill', setColor)
      }

      if ($(this).css('stroke') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('stroke');
          $(this).data('oldStrokeColor', setColor);
          i = cncserver.utils.closestColor(setColor);
          setColor = 'rgb(' + c[i].join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldStrokeColor');
        }

        // Set the new color!
        $(this).css('stroke', setColor)
      }
    });
  },

  // Grouping function to do a full wash of the brush
  fullWash: function(callback) {
    var $log = cncserver.utils.log('Doing a full brush wash...');
    cncserver.api.tools.change('water0', function(){
      cncserver.api.tools.change('water1', function(){
        cncserver.api.tools.change('water2', function(d){
          cncserver.api.pen.resetCounter();
          $log.logDone(d, false, true);
          if (callback) callback(d);
        });
      });
    });
  },

  // Wet the brush and get more of selected paint color, then return to
  // point given and trigger callback
  getMorePaint: function(point, callback) {
    var name = $('#' + cncserver.state.color).text().toLowerCase();
    var $stat = cncserver.utils.log('Going to get some more ' + name + ' paint...')
    cncserver.api.tools.change('water0', function(d){
      cncserver.api.tools.change(cncserver.state.color, function(d){
        cncserver.api.pen.resetCounter();
        cncserver.api.pen.up(function(d){
          cncserver.api.pen.move(point, function(d) {
            $stat.logDone('Done', 'complete', true);
            if (callback) callback(d);
          });
        });
      });
    });
  },

  // Returns a list of the current colorset, sorted by luminosty, or Y value
  sortedColors: function() {
    var colorsort = [];

    // Use JS internal sort by slapping a zero padded value into an array
    $.each(cncserver.config.colorsYUV, function(index, color){
      if (index != 8) { // Ignore white
        colorsort.push(cncserver.utils.pad(color[0], 3) + '|' + 'color' + index);
      }
    });
    colorsort.sort().reverse();

    // Now extract the luminostiy from the array, and leave a clean list of colors
    for(var i in colorsort){
      colorsort[i] = colorsort[i].split('|')[1];
    }

    return colorsort;
  },

  // Move through all paths in a given context, pull out all jobs and begin to
  // Push them into the buffer
  autoPaint: function(context, callback) {
     // Clear all selections
    $('path.selected', context).removeClass('selected');

    // Make sure the colors are ready
    $('#auto-color:not(.undo)').click();

    // Holds all jobs keyed by color
    var jobs = {};
    var colorMatch = cncserver.utils.closestColor;

    $('path', context).each(function(){
      var $p = $(this);
      var stroke = $p.attr('stroke');
      var fill = $p.attr('fill');

      // Occasionally, these come back undefined
      if (typeof stroke == 'undefined') stroke = 'none';
      if (typeof fill == 'undefined') fill = 'none';

      stroke = (stroke == 'none') ? false : 'color' + colorMatch(stroke);
      fill = (fill == 'none') ? false : 'color' + colorMatch(fill);

      // Don't actually fill or stroke for white... (color8)
      if (fill == 'color8') fill = false;
      if (stroke == 'color8') stroke = false;

      // Add fill (and fill specific stroke) for path
      if (fill) {
        // Initialize the color job object as an array
        if (typeof jobs[fill] == 'undefined') jobs[fill] = [];

        // Give all non-stroked filled paths a stroke of the same color first
        if (!stroke) {
          jobs[fill].push({t: 'stroke', p: $p});
        }

        // Add fill job
        jobs[fill].push({t: 'fill', p: $p});
      }

      // Add stroke for path
      if (stroke) {
        // Initialize the color job object as an array
        if (typeof jobs[stroke] == 'undefined') jobs[stroke] = [];

        jobs[stroke].push({t: 'stroke', p: $p});
      }
    });

    var sortedColors = cncserver.wcb.sortedColors();

    var finalJobs = [];

    $.each(sortedColors, function(i, c){
      if (typeof jobs[c] != 'undefined'){
        var topPos = finalJobs.length;
        for(j in jobs[c]){
          var out = {
            c: c,
            t: jobs[c][j].t,
            p: jobs[c][j].p
          };

          // Place strokes ahead of fills, but retain color order
          if (out.t == 'stroke') {
            finalJobs.splice(topPos, 0, out);
          } else {
            finalJobs.push(out);
          }

        }
      }
    });

    var jobIndex = 0;
    doNextJob();

    var $logItem = cncserver.utils.log('Full automatic painting! ' +
      $('path', context).length + ' paths, ' + finalJobs.length + ' jobs');


    // Nothing manages color during automated runs, so you have to hang on to it
    var runColor = cncserver.state.color;

    function doNextJob() {
      // Long process kill
      if (cncserver.state.process.cancel) {
        return;
      }

      var job = finalJobs[jobIndex];
      var run = cncserver.cmd.run;

      if (job) {
        // Make sure the color matches, full wash and switch colors!
        if (runColor != job.c) {
          run(['wash', ['tool', job.c]]);
          runColor = job.c;
        }

        cncserver.utils.addShortcuts(job.p);

        // Clear all selections
        $('path.selected', context).removeClass('selected');

        if (job.t == 'stroke'){
          job.p.addClass('selected');
          run([['log', 'Drawing path ' + job.p[0].id + ' stroke...']]);
          cncserver.paths.runOutline(job.p, function(){
            jobIndex++;
            run([['logdone', true]]);
            doNextJob();
          })
        } else if (job.t == 'fill') {
          run([['log', 'Drawing path ' + job.p[0].id + ' fill...']]);
          cncserver.paths.runFill(job.p, function(){
            jobIndex++;
            run([['logdone', true]]);
            doNextJob();
          })
        }
      } else {
        if (callback) callback();
        run(['wash','park']);
        // Done!
        $logItem.logDone('Complete')
      }
    }
  }
};
