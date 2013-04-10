/**
 * @file Holds all CNC Server utility helper functions
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
  // Adapted from svgcanvas in svg-edit main
  changeToPaths: function(context) {
    $('*:not(path,svg,g,title,metadata)', context).each(function(){
      var elem = this;
      var $elem = $(this);

      // Pass over attributes to new path element
      var svgNS = elem.ownerSVGElement.namespaceURI;
      var path = document.createElementNS(svgNS, 'path');

      $(path).attr({
        fill: $elem.attr('fill'),
        stroke: $elem.attr('stroke'),
        id: $elem.attr('id')
      })[0];

      if ($elem.attr('transform')){
        $(path).attr('transform', $elem.attr('transform'));
      }

      var d = '';

      var joinSegs = function(segs) {
        $.each(segs, function(j, seg) {
          var l = seg[0], pts = seg[1];
          d += l;
          for(var i=0; i < pts.length; i+=2) {
            d += (pts[i] +','+pts[i+1]) + ' ';
          }
        });
      }

      // Possibly the cubed root of 6, but 1.81 works best
      var num = 1.81;

      switch (elem.tagName) {
      case 'ellipse':
      case 'circle':
        var cx = $elem.attr('cx');
        var cy = $elem.attr('cy');
        var rx = $elem.attr('rx');
        var ry = $elem.attr('ry');

        if(elem.tagName == 'circle') {
          rx = ry = $elem.attr('r');
        }

        joinSegs([
          ['M',[(cx-rx),(cy)]],
          ['C',[(cx-rx),(cy-ry/num), (cx-rx/num),(cy-ry), (cx),(cy-ry)]],
          ['C',[(cx+rx/num),(cy-ry), (cx+rx),(cy-ry/num), (cx+rx),(cy)]],
          ['C',[(cx+rx),(cy+ry/num), (cx+rx/num),(cy+ry), (cx),(cy+ry)]],
          ['C',[(cx-rx/num),(cy+ry), (cx-rx),(cy+ry/num), (cx-rx),(cy)]],
          ['Z',[]]
        ]);
        break;
      case 'line':
        d = "M"+$(elem).attr('x1')+","+$(elem).attr('y1')+"L"+$(elem).attr('x2')+","+$(elem).attr('y2');
        break;
      case 'polyline':
      case 'polygon':
        d = "M" + $elem.attr('points');
        break;
      case 'rect':
        var rx = $elem.attr('rx');
        var ry = $elem.attr('ry');
        var b = elem.getBBox();
        var x = b.x, y = b.y, w = b.width, h = b.height;
        num = 4-num; // Why? Because!

        if(!rx && !ry) {
          // Regular rect
          joinSegs([
            ['M',[x, y]],
            ['L',[x+w, y]],
            ['L',[x+w, y+h]],
            ['L',[x, y+h]],
            ['L',[x, y]],
            ['Z',[]]
          ]);
        } else {
          joinSegs([
            ['M',[x, y+ry]],
            ['C',[x,y+ry/num, x+rx/num,y, x+rx,y]],
            ['L',[x+w-rx, y]],
            ['C',[x+w-rx/num,y, x+w,y+ry/num, x+w,y+ry]],
            ['L',[x+w, y+h-ry]],
            ['C',[x+w, y+h-ry/num, x+w-rx/num,y+h, x+w-rx,y+h]],
            ['L',[x+rx, y+h]],
            ['C',[x+rx/num, y+h, x,y+h-ry/num, x,y+h-ry]],
            ['L',[x, y+ry]],
            ['Z',[]]
          ]);
        }
        break;
      default:
        // Delete non-supported SVG elements
        elem.parentNode.removeChild(elem);
        return;
      }

      if(d) {
        path.setAttribute('d',d);
      }

      // Replace the current element with the converted one
      elem.parentNode.replaceChild(path, elem);
    });
  },

  log: function(msg) {
    var $logitem = $('<div>').append(
     $('<span>').addClass('time').text(new Date().toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1")),
     $('<span>').addClass('message').text(msg),
     $('<span>').addClass('status loading')
    );

    // Easy updating!
    $logitem.logDone = function(msg, classname, doHide){
      var $item = $logitem.children('.status');

      // Allow direct passing of object for success/error
      if (typeof msg != "string") {
        // If no classname, assume based on msg
        if (!classname) {
          classname = (msg === false ? 'error' : 'success')
        }

        msg = (msg === false ? 'Error!' : 'Success');
      }

      // If no classname STILL, just make one out of the text
      if (!classname) {
        classname = msg.toLowerCase();
      }
      $item.removeClass('loading').addClass(classname).text(msg);

      // Hide the element after 5 seconds if requested
      if (doHide) {
        setTimeout(function(){
          $logitem.fadeOut('slow');
        }, 5000);
      }
    }

    $logitem.appendTo($('#log'));
    $('#log')[0].scrollTop = $('#log')[0].scrollHeight;
    return $logitem;
  },

  // Easy set for progress!
  progress: function(options){
    if (typeof options.val !== "undefined") {
      $('progress').attr('value', options.val);
    }

    if (typeof options.max !== "undefined") {
      $('progress').attr('max', options.max);
    }
  },

  // Pad a string/number with zeros
  pad: function(str, max) {
    if (typeof str == "number") str = String(str);
    return str.length < max ? cncserver.utils.pad("0" + str, max) : str;
  },
  }
};
