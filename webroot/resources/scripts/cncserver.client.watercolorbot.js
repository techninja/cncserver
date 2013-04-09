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
          $log.logDone('Complete');
          if (callback) callback(d);
        });
      });
    });
  },

  // Wet the brush and get more of selected paint color, then return to
  // point given and trigger callback
  getMorePaint: function(point, callback) {
    var $stat = cncserver.utils.log('Going to get some more paint...')
    cncserver.api.tools.change('water0', function(d){
      cncserver.api.tools.change($('.color.selected').attr('id'), function(d){
        cncserver.api.pen.resetCounter();
        cncserver.api.pen.up(function(d){
          cncserver.api.pen.move(point, function(d) {
            $stat.logDone('Done', 'complete');
            callback(d);
          });
        });
      });
    });
  }
};
