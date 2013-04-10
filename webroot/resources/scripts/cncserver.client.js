/**
 * @file Holds all CNC Server central controller objects and DOM management code
 */

var cncserver = {
  canvas: {
    height: 0,
    width: 0,
    scale: 1,
    offset: {
      top: 147,
      left: 235
    }
  },
  state: {
    pen: {},
    buffer: [], // Hold commands to be interpreted as free operations come
    color: 'color1', // Default color selection
    process: {
      name: 'idle',
      waiting: false,
      busy: false,
      max: 0
    }
  },
  config: {
    precision: 5,
    maxPaintDistance: 6000,
    fillPath: {},
    colorAction: 'bot',
    colors: [],
    colorsYUV: []
  }
};


$(function() {

  var $path = {};
  var $fillPath = {};
  var index = 1;
  var $svg = $('svg#main');

  cncserver.canvas.height = $svg.height();
  cncserver.canvas.width = $svg.width();

  // Cache the current colorset config for measuring against as HSL
  $('a.color').each(function(){
    cncserver.config.colors.push(
      cncserver.utils.colorStringToArray($(this).css('background-color'))
    );
  });
  // Also add white paper for near-white color detection
  cncserver.config.colors.push([255,255,255]);

  // Add cached YUV conversions for visual color matching
  $.each(cncserver.config.colors, function(i, color){
    cncserver.config.colorsYUV.push(cncserver.utils.rgbToYUV(color));
  });

  // Load default content from SVG-edit
  if (localStorage["svgedit-default"]){
    $('svg#main g#cncserversvg').append(localStorage["svgedit-default"]);

    // Convert anything not a path into a path for proper tracing
    cncserver.utils.changeToPaths('svg#main g#cncserversvg');
  }

  // Ensure buttons are disabled as we have no selection
  $('#draw').prop('disabled', true);
  $('#fill').prop('disabled', true);

  // Fit the SVG to the screen size
  fitSVGSize();
  setTimeout(fitSVGSize, 500);

  var stopDraw = false;
  var stopBuildFill = false;
  cncserver.config.precision = Number($('#precision').val());

  // Bind color action config set and set initial
  $('input[name=color-action]:radio').change(function(e){
    cncserver.config.colorAction = $(this).val();
  })
  cncserver.config.colorAction = $('input[name=color-action]:radio:checked').val();

  // Set Fill Path
  cncserver.config.fillPath = $('#fill-swirl');

  // Get initial pen data from server
  var $log = cncserver.utils.log('Connecting to the WaterColorBot...');
  cncserver.api.pen.stat(function(d){
    $log.logDone(d);

    // Set the Pen state button
    $('#pen').addClass(!cncserver.state.pen.state ? 'down' : 'up')
    .text('Brush ' + (!cncserver.state.pen.state ? 'Down' : 'Up'));

    // Select tool from last machine tool
    if (cncserver.state.pen.tool) {
      $('.color').removeClass('selected');
      if (cncserver.state.pen.tool.indexOf('color') !== -1) {
        cncserver.state.color = cncserver.state.pen.tool;
        $('#' + cncserver.state.pen.tool).addClass('selected');
      } else {
        $('#' + cncserver.state.color).addClass('selected');
      }
    }
  });

  // Bind SVG element click for $path select/deselect
  $svg.on('click', function(e){
    var selected = false;

    // If the target of the click matches the wrapper, deslect
    if (e.target == this) {
      if ($path.length) {
        $path.removeClass('selected');
        delete($path);
      }
    } else { // Otherwise, select
      selected = true;
      if ($path.length) {
        $path.removeClass('selected');
      }
      $path = $(e.target);
      $path.addClass('selected');
      $path.transformMatrix = $path[0].getTransformToElement($path[0].ownerSVGElement);
      $path.getPoint = function(distance){ // Handy helper function for gPAL
        var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
        return {x: p.x, y: p.y};
      };
      $path.maxLength = $path[0].getTotalLength(); // Shortcut!
      cncserver.path = $path;
      index = 0;
    }

    // Enable/disable buttons if selected/not
    $('#movefirst').prop('disabled', !selected);
    $('#draw').prop('disabled', !selected);
    $('#fill').prop('disabled', !selected);

    e.stopPropagation(); // Don't bubble up and select groups
  });

  // Select Fill Path and set matrix
  $fillPath = $('svg #fill-swirl');
  $fillPath.transformMatrix = $fillPath[0].getTransformToElement($fillPath[0].ownerSVGElement);

  $('#control fieldset').click(function(e){
    if ($(this).is('.closed')){
      var $open = $('#control fieldset.open');
      var $close = $(this);

      // Open one to closed
      $open.removeClass('open');
      $open.addClass('closed');

      // Closed to open
      $close.removeClass('closed');
      $close.addClass('open');
    }
  });

  // Bind to Tool Change nav items
  $('nav#tools a').click(function(e){

    // Instead of controlling the bot, change the path!
    if ($(this).is('.color')) {
      if (cncserver.config.colorAction == 'fill' || cncserver.config.colorAction == 'stroke'){
        if ($path.length) {
          $path.attr('style', '');
          $path.attr(cncserver.config.colorAction, $(this).css('background-color'));
        }
        $(this).blur();
        return false;
      }

      $('nav#tools a.selected').removeClass('selected');
      $(this).addClass('selected');
    }

    // X clicked: Do a full brush wash, or clear the stroke/fill of $path
    if ($(this).is('#colorx')) {
      if (cncserver.config.colorAction == 'fill' || cncserver.config.colorAction == 'stroke'){
        $path.attr('style', '');
        $path.attr(cncserver.config.colorAction, 'none');
      } else {
        cncserver.wcb.fullWash();
        $('nav#tools a.selected').removeClass('selected');
      }
      return false;
    }

    // White/Paper clicked: Set the stroke/fill of $path to white
    if ($(this).is('#colornone')) {
      if (cncserver.config.colorAction == 'fill' || cncserver.config.colorAction == 'stroke'){
        $path.attr('style', '');
        $path.attr(cncserver.config.colorAction, 'rgb(255,255,255)');
      }
      return false;
    }

    // Standard tool change...
    var stuff = this.id.indexOf('water') == -1 ? $(this).text().toLowerCase() + ' paint' : 'water'
    var $stat = cncserver.utils.log('Putting some ' + stuff + ' on the brush...')
    cncserver.api.tools.change(this.id, function(d){
      $stat.logDone(d);
      cncserver.api.pen.resetCounter();
    });

    return false;
  });

  // Bind to control buttons
  $('#park').click(function(){
    cncserver.api.pen.park(cncserver.utils.log('Parking brush...').logDone);
  });
  $('#movefirst').click(function(){});
  $('#draw').click(function(){
    cncserver.paths.runOutline($path);
  });

  $('#pen').click(function(){
    if (cncserver.state.pen.state) {
      cncserver.api.pen.up(function(){
        $('#pen').removeClass('up').addClass('down').text('Brush Down');
      });
    } else {
      cncserver.api.pen.down(function(){
        $('#pen').removeClass('down').addClass('up').text('Brush Up');
      });
    }
  });
  $('#disable').click(function(){
    cncserver.api.motors.unlock(cncserver.utils.log('Unlocking stepper motors...').logDone);
  });
  $('#zero').click(function(){
    cncserver.api.pen.zero(cncserver.utils.log('Resetting absolute position...').logDone);
  });
  $('#precision').change(function(){cncserver.config.precision = Number($(this).val());});

  $('#auto-color').click(function(){
    // Momentarily hide selection
    if ($path.length) $path.toggleClass('selected');

    $(this).toggleClass('undo');
    cncserver.wcb.autoColor($('#cncserversvg'), !$(this).is('.undo'));

    // Bring back selection
    if ($path.length) $path.toggleClass('selected');

  });

  // Bind to fill controls
  $('#fill').click(function(){
    cncserver.paths.runFill($path, $('#fills select').val());
  });

  // Move the visible draw position indicator
  cncserver.moveDrawPoint = function(point) {
    // Move visible drawpoint
    $('#drawpoint').attr('transform', 'translate(' + point.x + ',' + point.y + ')');
  }

  // Catch the resize event and fill the main svg element to the screen
  $(window).resize(fitSVGSize);

  function fitSVGSize(){
    var offset = $svg.offset();
    var margin = 40; // TODO: Place this somewhere better
    var rightMargin = 235; // TODO: This too...
    var scale = {
      x: ($(window).width() - offset.left - margin - rightMargin) / cncserver.canvas.width,
      y: ($(window).height() - offset.top - margin) / cncserver.canvas.height
    }

    // Use the shorter of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $svg.css('transform', 'scale(' + cncserver.canvas.scale + ')');
    $svg.css('-webkit-transform', 'scale(' + cncserver.canvas.scale + ')');
  }

});
