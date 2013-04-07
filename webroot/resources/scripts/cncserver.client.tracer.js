/**
 * @file Holds all CNC Server path tracing helper functions
 */

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   array  color    The RGB color to be converted
 * @return  Array           The HSL representation
 */
cncserver.utils = {
  rgbToHSL: function (color){
    if (!color) return false;

    var r = color[0];
    var g = color[1];
    var b = color[2];

    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
      h = s = 0; // achromatic
    }else{
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max){
        case r:h = (g - b) / d + (g < b ? 6 : 0);break;
        case g:h = (b - r) / d + 2;break;
        case b:h = (r - g) / d + 4;break;
      }
      h /= 6;
    }

    return [h, s, l];
  },

  rgbToYUV: function(color) {
    if (!color) return false;

    var r = color[0];
    var g = color[1];
    var b = color[2];
    var y,u,v;

    y = r *  .299000 + g *  .587000 + b *  .114000
    u = r * -.168736 + g * -.331264 + b *  .500000 + 128
    v = r *  .500000 + g * -.418688 + b * -.081312 + 128

    y = Math.floor(y);
    u = Math.floor(u);
    v = Math.floor(v);

    return [y,u,v];
  },

  // Converts a jQuery rgb or hex color string to a proper array [r,g,b]
  colorStringToArray: function(string) {
    // If it's already RGB, use it!
    if (string.indexOf('rgb') !== -1){
      var color = string.slice(4, -1).split(', ');

      $.each(color, function(i, c){
        color[i] = Number(c);
      })

      return color;
    } else {
      // Otherwise, parse the hex triplet
      // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
      var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      string = string.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
      });

      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(string);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : null;
    }

  },

  // Takes source color and matches it to closest array of colors from colorset
  // Source color input is a triplet array [r,g,b] or jQuery RGB string
  closestColor: function(source, whiteLimit){
    if (typeof source == 'string'){
      source = cncserver.utils.colorStringToArray(source);
    }

    // Value where Luminosity at or above will lock to White
    if (!whiteLimit) {
      whiteLimit = 0.72
    }

    // Return white if the luminosity is above the given threshold
    if (cncserver.utils.rgbToHSL(source)[2] >= whiteLimit) {
      //return cncserver.config.colors.length-1;
    }

    // Convert to YUV to better match human perception of colors
    source = cncserver.utils.rgbToYUV(source);

    var lowestIndex = 0;
    var lowestValue = 1000; // High value start is replaced immediately below
    var distance = 0;
    for (var i=0; i < cncserver.config.colors.length; i++){
      var c = cncserver.config.colorsYUV[i];

      // Color distance finder
      distance = Math.sqrt(
        Math.pow(c[0] - source[0], 2) +
        Math.pow(c[1] - source[1], 2) +
        Math.pow(c[2] - source[2], 2)
      );

      // Lowest value (closest distance) wins!
      if (distance < lowestValue){
        lowestValue = distance;
        lowestIndex = i;
      }
    }
    return lowestIndex;
  },

  // Convert all document svg elements capable into paths!
  changeToPaths: function() {
    var polys = document.querySelectorAll('polygon,polyline');
    [].forEach.call(polys, convertPolyToPath);

    var lines = document.querySelectorAll('line');
    [].forEach.call(lines, convertLineToPath);

    function convertPolyToPath(poly){
      var svgNS = poly.ownerSVGElement.namespaceURI;
      var path = document.createElementNS(svgNS,'path');
      var points = poly.getAttribute('points').split(/\s+|,/);
      var x0=points.shift(), y0=points.shift();
      var pathdata = 'M'+x0+','+y0+'L'+points.join(' ');
      if (poly.tagName=='polygon') {
        pathdata+='z';
      }
      path.setAttribute('d',pathdata);

      path.setAttribute('stroke', poly.getAttribute('stroke'));
      path.setAttribute('stroke-width', poly.getAttribute('stroke-width'));
      path.setAttribute('fill', poly.getAttribute('fill'));
      path.setAttribute('style', poly.style.cssText);
      path.setAttribute('id', poly.id);
      poly.parentNode.replaceChild(path,poly);
    }

    function convertLineToPath(line){
      var svgNS = line.ownerSVGElement.namespaceURI;
      var path = document.createElementNS(svgNS,'path');
      path.setAttribute('d', 'M'+
        line.getAttribute('x1')+','+
        line.getAttribute('y1')+' L'+
        line.getAttribute('x2')+','+
        line.getAttribute('y2'));
      path.setAttribute('stroke', line.getAttribute('stroke'));
      path.setAttribute('stroke-width', line.getAttribute('stroke-width'));
      path.setAttribute('style', line.style.cssText);
      path.setAttribute('id', line.id);
      line.parentNode.replaceChild(path, line);
    }
  },

  log: function(msg) {
    var $logitem = $('<div>').append(
     $('<span>').addClass('time').text(new Date().toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1")),
     $('<span>').addClass('message').text(msg),
     $('<span>').addClass('status loading')
    );

    // Easy updating!
    $logitem.logDone = function(msg, classname){
      var $item = $logitem.children('.status');

      // Allow direct passing of object for success/error
      if (typeof msg != "string") {
        // If no classname, assume based on msg
        if (typeof classname == 'undefined') {
          classname = (msg === false ? 'error' : 'success')
        }

        msg = (msg === false ? 'Error!' : 'Success');
      }

      // If no classname STILL, just make one out of the text
      if (typeof classname == 'undefined') {
        classname = msg.toLowerCase();
      }
      $item.removeClass('loading').addClass(classname).text(msg);
    }

    $logitem.appendTo($('#log'));
    return $logitem;
  }
};
