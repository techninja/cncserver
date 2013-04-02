/**
 * @file Holds all CNC Server central controller objects and DOM management code
 */

var cncserver = {
  canvas: {
    height: 0,
    width: 0
  },
  state: {
    pen: {}
  },
  config: {
    precision: 1,
    maxPaintDistance: 12000
  }
};


$(function() {

  var $path = {};
  var $fillPath = {};
  var index = 1;
  var $svg = $('#main');
  var svgOffset = $svg.offset();

  cncserver.canvas.height = $svg.height();
  cncserver.canvas.width = $svg.width();

  // Fit the SVG to the screen size
  fitSVGSize();

  var stopDraw = false;
  var stopBuildFill = false;
  cncserver.config.precision = Number($('#precision').val());

  // Convert the polys and lines to path
  // TODO: This happens after load, or before print... :|
  changeToPaths();

  // Get initial pen data from machine
  cncserver.api.pen.stat(function(){
    // Select tool from last machine tool
    if (cncserver.state.pen.tool) {
      $('.color').removeClass('selected');
      $('#' + cncserver.state.pen.tool).addClass('selected');
    }
  });


  // Bind all SVG element click / select
  $('svg *:not(g)').on('click', function(e){
    if ($path.length) {
      $path.removeClass('selected');
    }
    $path = $(this);
    $path.addClass('selected');
    $path.transformMatrix = this.getTransformToElement(this.ownerSVGElement);
    index = 0;

    // Enable buttons because we're selected now!
    $('#movefirst').prop('disabled', false);
    $('#draw').prop('disabled', false);
    $('#fill-build').prop('disabled', false);
    $('#fill-paint').prop('disabled', !$path.data('fill'));

    e.stopPropagation(); // Don't bubble up and select groups
  });

  // Select Fill Path and set matrix
  $fillPath = $('svg #fill-swirl');
  $fillPath.transformMatrix = $fillPath[0].getTransformToElement($fillPath[0].ownerSVGElement);

  // Bind to Tool Change nav items
  $('nav#tools a').click(function(e){
    cncserver.api.tools.change(this.id, function(){
      cncserver.api.pen.reset();
    });
    if ($(this).is('.color')){
      $('nav#tools a.selected').removeClass('selected');
      $(this).addClass('selected');
    }
  });

  // Bind to control buttons
  $('#park').click(function(){ cncserver.api.pen.park(); });
  $('#movefirst').click(function(){ cncserver.api.pen.up(readyFirstPoint); });
  $('#draw').click(function(){
    if (stopDraw === 0) {
      stopDraw = true;
    } else {
      stopDraw = 0;
      $('#draw').text('STOP Draw');
      drawNextPoint();
    }
  });

  $('#pen-up').click(function(){ cncserver.api.pen.up(); });
  $('#pen-down').click(function(){ cncserver.api.pen.down(); });
  $('#disable').click(function(){ cncserver.api.motors.unlock(); });
  $('#precision').change(function(){ cncserver.config.precision = Number($(this).val()); });

  // Bind to fill controls
  $('#fill-build').click(function(){
    // stopBuildFill is 0 if running
    if (stopBuildFill === 0) {
      stopBuildFill = true;
    } else {
      stopBuildFill = 0;
      simulatePathFill($('#fills select').val());
    }
  });

  $('#fill-paint').click(function(){
    // stopDraw is 0 if running
    if (stopDraw === 0) {
      stopDraw = true;
    } else {
      stopdraw = 0;
      drawFill();
    }
  });


  // Convert everything to paths
  function changeToPaths() {
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
      path.setAttribute('style', line.style.cssText);
      path.setAttribute('id', line.id);
      line.parentNode.replaceChild(path, line);
    }
  }

  // Move to first point and wait
  function readyFirstPoint() {
    cncserver.api.pen.move($path[0].getPointAtLength(0).matrixTransform($path.transformMatrix));
  }


  // Move the visible draw position indicator
  cncserver.moveDrawPoint = function(point) {
    // Move visible drawpoint
    $('#drawpoint').attr('transform', 'translate(' + point.x + ',' + point.y + ')');
  }

  // Outlines all visible portions of a given path, one step at a time
  function drawNextPoint(){
    index+= cncserver.config.precision;
    if (index > $path[0].getTotalLength() || stopDraw) {
      stopDraw = false;
      console.log('Path Complete!');
      $('#draw').text('Draw Path');
      index = 0;
      cncserver.api.pen.up();
      return;
    }

    var point = $path[0].getPointAtLength(index).matrixTransform($path.transformMatrix);

    // Only ignore the pen timeout if we've been drawing
    // TODO: This is probably still a bad idea
    point.ignoreTimeout = (cncserver.state.pen.distanceCounter == 0 ? 0 : 1);

    // With each coordinate, check to see that the path is visible
    getPenStatePathCollide($path[0], point, function(){
      cncserver.api.pen.move(point, function(data){

        // If we've used this one too much, go get more paint!
        if (data.distanceCounter > cncserver.config.maxPaintDistance) {
          getMorePaint(point, function(){
            index-= cncserver.config.precision * 5; // Draw backwards three steps
            drawNextPoint();
          });
        } else {
          drawNextPoint();
        }

      });
    });
  }

  // Find out what DOM object is directly below the point given
  // Will NOT work if point is outside visible screen range!
  function getPointPathCollide(point) {
    return document.elementFromPoint(point.x+svgOffset.left+2, point.y+svgOffset.top+2);
  }

  // Set the pen down or up based on visibility of a given path at a given point
  // TODO: Document this function
  function getPenStatePathCollide(path, point, callback) {
    // Drawpoint element can get in the way of elementFromPoint, hide it!
    $('#drawpoint').hide();
    var coordPath = getPointPathCollide(point);
    $('#drawpoint').show();

    if (coordPath) {
      // Check that the objects are exactly the same
      if (coordPath == path){
        // Correct path, visible at this coordinate!!
        // If Pen isn't down, put it down, then continue!
        if (cncserver.state.pen.state == 0){
          cncserver.api.pen.down(callback);
        } else{
          callback();
        }
      } else {
        // Wrong path!
        console.log('Path Hidden by ', coordPath.id);

        // If Pen is down, put it up, then continue!
        if (cncserver.state.pen.state == 1){
          cncserver.api.pen.up(callback);
        } else {
          callback();
        }
      }
    } else {
      console.log('Point not visible!: ', point);
      callback();
    }
  }

  // Wet the brush and get more of selected paint color, then return to
  // point given and trigger callback
  function getMorePaint(point, callback) {
    cncserver.api.tools.change('water1', function(){
      cncserver.api.tools.change($('.color.selected').attr('id'), function(){
        cncserver.api.pen.reset();
        cncserver.api.pen.up(function(){
          cncserver.api.pen.move(point, callback);
        });
      });
    });
  }

  // Build all coordinates for filling a path
  function simulatePathFill(fillStyle) {
    var point = {};
    var lastPoint = {};
    var fillIndex = 0;
    var fillPrecision = 10;
    var max = $fillPath[0].getTotalLength();
    var queueIndex = 0;
    var fillSpacing = 8; // Only used for horizontal or vertical fillStyle
    var pathRect = $path[0].getBoundingClientRect();

    pathRect = {
      top: pathRect.top - svgOffset.top,
      left: pathRect.left - svgOffset.left,
      right: pathRect.right - svgOffset.left,
      bottom: pathRect.bottom - svgOffset.top
    }

    $('#fill-build').text('STOP Build');

    // Clear canvas and set visual options
    $('canvas#simulate')[0].width = $('canvas#simulate').width();
    var can = $('canvas#simulate')[0].getContext('2d');
    can.strokeStyle = '#999';
    can.lineWidth  = 6;

    if (!fillStyle) {
      fillStyle = 'path';
    }

    // Other fill styles..
    if (fillStyle == 'horizontal') {
      max = (cncserver.canvas.height / fillSpacing) * cncserver.canvas.width;
      fillPrecision = 10;

      // Start the fillIndex at the Bounding Box TOP
      var top = pathRect.top;
      fillIndex = (top / fillSpacing) * cncserver.canvas.width;
    }

    if (fillStyle == 'vertical') {
      max = (cncserver.canvas.width / fillSpacing) * cncserver.canvas.height;
      fillPrecision = 10;

      var left = pathRect.left;
      fillIndex = (left / fillSpacing) * cncserver.canvas.height;
    }

    fillQueue = [];
    fillQueue[0] = [];

    $path.removeClass('selected');
    $('#drawpoint').hide();
    $('nav#fills progress').attr({max: max, value: 0});

    simulateNextPathFillStep();

    function simulateNextPathFillStep(){
      // Follow a given selected path to trace to make the fill
      if (fillStyle == 'path') {
        point = $fillPath[0].getPointAtLength(fillIndex).matrixTransform($fillPath.transformMatrix);
      } else if (fillStyle == 'horizontal') {
        // Hatch back and forth lines across the full width to the bottom

        // Get the number of full widths done so far
        var fillWidths = parseInt(fillIndex / cncserver.canvas.width);

        // Our fillIndex less any full widths crossed, gives us any leftover
        point.x = fillIndex - (fillWidths * cncserver.canvas.width);

        // Alternate directions
        if (fillWidths % 2) {
          point.x = cncserver.canvas.width - point.x;
        }

        // How many widths we've gone so far, multiply that by the fillspacing for height
        point.y = fillWidths * fillSpacing;

        // Short circuit if point is beyond bottom of path
        if (point.y > pathRect.bottom) {
          fillIndex = max;
        }

      } else if (fillStyle == 'vertical') {
        // Hatch up and down lines the full height to the right

        // Get the number of full heights done so far
        var fillHeights = parseInt(fillIndex / cncserver.canvas.height);

        // Our fillIndex less any full heights crossed, gives us any leftover
        point.y = fillIndex - (fillHeights * cncserver.canvas.height);

        // Alternate directions
        if (fillHeights % 2) {
          point.y = cncserver.canvas.height - point.y;
        }

        // How many heights we've gone so far, multiply that by the fillspacing for width
        point.x = fillHeights * fillSpacing;

        // Short circuit if point is beyond bottom of path
        if (point.x > pathRect.right) {
          fillIndex = max;
        }
      }

      // Assume it's a good point!
      var validPoint = true;

      // Simple sanity check to see that point inside the bounds of the
      if (point.x < pathRect.left || point.x > pathRect.right) {
        validPoint = false;
      }

      if (point.y < pathRect.top || point.y > pathRect.bottom) {
        validPoint = false;
      }

      // If we still think it's valid, use the slow visual path collision check
      if (validPoint) {
        validPoint = getPointPathCollide(point) == $path[0];
      }

      if (validPoint){
        if (lastPoint.x) {
          can.moveTo(lastPoint.x, lastPoint.y);
          can.lineTo(point.x, point.y);
          can.stroke();
        }

        // Add point to queue
        fillQueue[queueIndex].push({x: point.x, y: point.y});

        lastPoint.x = point.x;
        lastPoint.y = point.y;
      } else { // No match! Clear lastPoint

        // Just moved away from a draw point, move to next queue index and clear point
        if (lastPoint.x) {
          queueIndex++;
          fillQueue[queueIndex] = [];
          lastPoint = {};
        }
      }
      fillIndex+= fillPrecision;

      $('nav#fills progress').attr('value', fillIndex);

      // Done! (or quit)
      if (fillIndex > max || stopBuildFill) {
        fillIndex = 0;

        // Bring back these defaults
        $path.addClass('selected'); // Show selection
        $('#drawpoint').show(); // Show drawpoint
        $('#fill-build').text('Build Fill'); // Reset button text
        stopBuildFill = false;
        $('nav#fills progress').attr('value', 0); // Clear progress

        if (!stopBuildFill) {
          console.log('Path fill done!')
          $path.data('fill', fillQueue); // Pass the draw queue into the element
          $('#fill-paint').prop('disabled', false); // Enable paint button
        }
      } else {
        // Run Again! Waits 1 ms, lets browser do other things
        setTimeout(simulateNextPathFillStep, 1);
      }
    }
  }


  // Actually draw the pre-built fill path points
  function drawFill(){
    var fillQueue = $path.data('fill');
    var fillGroupIndex = 0;
    var fillIndex = 0;
    var point = {};

    $('#fill-paint').text('STOP Draw');

    cncserver.api.pen.up(drawNextFillPath);

    // Iteratively draw next path in queue
    function drawNextFillPath(){

      // Done Painting! or stopped
      if (typeof fillQueue[fillGroupIndex] == "undefined" || stopDraw) {
        stopDraw = false;
        $('#fill-paint').text('Paint Fill');
        cncserver.api.pen.up();
      }

      cncserver.api.pen.move(fillQueue[fillGroupIndex][fillIndex], function(data){
        cncserver.api.pen.down(function(){
          fillIndex++;

          // Moved beyond group contents, move to next group
          if (fillIndex > fillQueue[fillGroupIndex].length -1) {
            fillIndex = 0;
            fillGroupIndex++;
            // Move to next path after raising pen
            cncserver.api.pen.up(drawNextFillPath);
          } else { // Actually painting...
            if (cncserver.state.pen.distanceCounter > cncserver.config.maxPaintDistance) {
              console.log('Time to go get more paint!');
              getMorePaint(fillQueue[fillGroupIndex][fillIndex-1], function(){
                console.log('Resuming fill painting');
                drawNextFillPath();
              });
            } else {
              drawNextFillPath();
            }
          }
        });
      });


    }
  }

  // Catch the resize event and fill the main svg element to the screen
  $(window).resize(fitSVGSize);

  function fitSVGSize(){
    var offset = $('svg#main').offset();
    var margin = 40; // TODO: Place this somewhere better
    var scale = {
      x: ($(window).width() - offset.left - margin) / cncserver.canvas.width,
      y: ($(window).height() - offset.top - margin) / cncserver.canvas.height
    }

    // Use the shorter of the two
    scale = scale.x < scale.y ? scale.x : scale.y;

    $('svg#main').css('transform', 'scale(' + scale + ')')
  }

});
