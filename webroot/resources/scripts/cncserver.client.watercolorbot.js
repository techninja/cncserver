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
  }
};
