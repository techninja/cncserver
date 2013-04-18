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
      cancel: false,
      paused: false,
      max: 0
    }
  },
  config: {
    precision: 5,
    maxPaintDistance: 6000,
    fillPath: {},
    colorAction: 'bot',
    colorsets: {},
    colors: [],
    colorsYUV: []
  }
};


$(function() {
  var $path = {};
  var $svg = $('svg#main');

  serverConnect(); // "Connect", and get the initial pen state
  bindControls(); // Bind all clickable controls
  loadSVG(); // Load the default SVG

  getColorsets(); // Get & Load the colorsets, then cache the default

  // Store the canvas size
  cncserver.canvas.height = $svg.height();
  cncserver.canvas.width = $svg.width();

  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  // Set initial values (as page reloads can save form values)
  cncserver.config.precision = Number($('#precision').val());
  cncserver.config.colorAction = $('#coloraction').val();
  cncserver.config.fillPath = $('#fill-swirl'); // Set Fill Path


  // Initial server connection handler
  function serverConnect() {
    // Get initial pen data from server
    var $log = cncserver.utils.log('Connecting to the server...');
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
  }

  function getColorsets() {
    $.getJSON('/resources/colorsets/colorsets.json', function(sets){
      cncserver.config.colorsets['ALL'] = sets;
      $.each(sets, function(i, set){
        var setDir = '/resources/colorsets/' + set + '/';

        $.getJSON(setDir + set + '.json', function(c){
          cncserver.config.colorsets[set] = {
            name: c.name,
            baseClass: c.styles.baseClass,
            colors: c.colors
          };

          // Add the stylesheet so it can load
          $('<link>').attr({rel: 'stylesheet', href: setDir + c.styles.src}).appendTo('head');

          // If we've got all of them, go load them in
          if (Object.keys(cncserver.config.colorsets).length == sets.length + 1) {

            loadColorsets();
          }
        });
      });
    });
  }

  function loadColorsets() {
    for(var i in cncserver.config.colorsets['ALL']) {
      var id = cncserver.config.colorsets['ALL'][i];
      $('<option>')
        .val(id)
        .text(cncserver.config.colorsets[id].name)
        .appendTo('#colorsets');
    }

    // Bind change for colors
    $('#colorsets').change(function(){
      var id = $(this).val();
      var set = cncserver.config.colorsets[id];
      $('#colors').attr('class', '').addClass(set.baseClass);
      for (var i in set.colors) {
        $('#color' + i).text(set.colors[i]);
      }

      cacheColors();
    }).change();
  }

  function cacheColors() {
    // Cache the current colorset config for measuring against as HSL
    cncserver.config.colors = [];
    cncserver.config.colorsYUV = [];

    // Check to see if CSS is loaded...
    var colorTest = $('#color0').css('background-color');
    if (colorTest == "transparent" || colorTest == "rgba(0, 0, 0, 0)") {
      setTimeout(cacheColors, 500);
      console.info('css still loading...');
      return;
    }

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
  }


  function loadSVG() {
    // Load default content from SVG-edit
    if (localStorage["svgedit-default"]){
      $('svg#main g#cncserversvg').append(localStorage["svgedit-default"]);

      // Convert anything not a path into a path for proper tracing
      cncserver.utils.changeToPaths('svg#main g#cncserversvg');
    }

    // Bind SVG path elements click for $path select/deselect
    $svg.click(function(e){
      var selected = false;

      // If the target of the click matches the wrapper, deslect
      if (e.target == this) {
        if ($path.length) {
          $path.removeClass('selected');
          delete($path);
        }
      } else { // Otherwise, select
        selected = true;
        if ($path.length)$path.removeClass('selected');

        $path = $(e.target);
        cncserver.utils.addShortcuts($path);
        $path.addClass('selected');
        cncserver.path = $path;
      }

      // Enable/disable buttons if selected/not
      $('#movefirst').prop('disabled', !selected);
      $('#draw').prop('disabled', !selected);
      $('#fill').prop('disabled', !selected);

      e.stopPropagation(); // Don't bubble up and select groups
    });
  }

  function bindControls() {
    // Ensure buttons are disabled as we have no selection
    $('#draw').prop('disabled', true);
    $('#fill').prop('disabled', true);

    // Pause management
    var pauseLog = {};
    var pauseText = 'Click to pause current operations';
    var resumeText = 'Click to resume previous operations';
    var pausePenState = 0;
    $('#pause').click(function(){
      function _resumeDone() {
        pausePenState = 0;
        pauseLog.fadeOut('slow');
        cncserver.state.process.paused = false;
        cncserver.cmd.executeNext();
        $('#pause').removeClass('active').attr('title', pauseText).text('Pause');
      }

      if (!cncserver.state.process.paused && cncserver.state.buffer.length) {
        pauseLog = cncserver.utils.log('Pausing current process...');
        cncserver.state.process.paused = true;
      } else {
        // If the pen was down before, put it down now.
        if (pausePenState) {
          cncserver.api.pen.down(_resumeDone);
        } else {
          _resumeDone();
        }
      }
    });

    // Pause callback
    cncserver.state.process.pauseCallback = function(){
      // Remember the state, and then make sure it's up
      pausePenState = cncserver.state.pen.state;
      if (pausePenState == 1) {
        cncserver.api.pen.up(_pauseDone);
      } else {
        _pauseDone();
      }

      function _pauseDone() {
        pauseLog.logDone('Done', 'complete');
        $('#pause').addClass('active').attr('title', resumeText).text('Resume');
      }
    }

    // Cancel Management
    $('#cancel').click(function(){

      if (!cncserver.state.process.cancel && cncserver.state.buffer.length) {
        cncserver.state.process.cancel = true;

        cncserver.state.process.busy = false;
        cncserver.state.process.max = 0;
        cncserver.utils.progress({val: 0, max: 0});

        cncserver.state.buffer = []; // Kill the buffer
        cncserver.api.pen.park(); // Park
        // Clear all loading logs into cancelled state
        $('#log > div:visible').each(function(){
          if ($(this).children('.loading').length) {
            $(this).children('.loading')
            .removeClass('loading').text('Canceled')
            .addClass('error');
          }
        })
      }
    })


    // Bind color action config set and set initial
    $('#coloraction').change(function(e){
      cncserver.config.colorAction = $(this).val();
    })

    // Bind to control buttons
    $('#park').click(function(){
      cncserver.api.pen.park(cncserver.utils.log('Parking brush...').logDone);
    });
    $('#movefirst').click(function(){});
    $('#draw').click(function(){
      cncserver.cmd.run([['log', 'Drawing path ' + $path[0].id + ' outline...']]);
      cncserver.paths.runOutline($path, function(){
        cncserver.cmd.run('logdone')
      });
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

    $('#auto-paint').click(function(){
      // Momentarily hide selection
      if ($path.length) $path.toggleClass('selected');

      cncserver.wcb.autoPaint($('#cncserversvg'));
      // TODO: Lock various controls
    });

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
      cncserver.cmd.run([['log', 'Drawing path ' + $path[0].id + ' fill...']]);
      cncserver.paths.runFill($path, function(){
        cncserver.cmd.run('logdone');
      });
    });

    // Move the visible draw position indicator
    cncserver.moveDrawPoint = function(point) {
      // Move visible drawpoint
      $('#drawpoint').attr('transform', 'translate(' + point.x + ',' + point.y + ')');
    }

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
  }

  function responsiveResize(){
    // These value should be static, set originally from central canvas config
    var svgOffset = {
      top: 147,
      left: 235
    };

    var w = $(window).width();
    var h = $(window).height();


    var margin = 40; // TODO: Place this somewhere better
    var rightMargin = $(window).width() - $('#control').offset().left;
    var scale = 0;

    // Tool selection height scale
    var toolMax = 735;
    var $tools = $('#tools');
    if (h < toolMax) {
      scale = (h - $tools.offset().top - 20) / $tools.height();
    } else {
      scale = 1;
    }

    // Update the global canvas left offset
    cncserver.canvas.offset.left = svgOffset.left * scale;
    var offsetDifference = svgOffset.left - cncserver.canvas.offset.left;

    $tools.css({
      'transform': 'scale(' + scale + ')',
      '-webkit-transform': 'scale(' + scale + ')'
    });

    $svg.css('left', cncserver.canvas.offset.left);

    // Scale SVG Canvas
    scale = {
      x: (w - svgOffset.left - margin - rightMargin + offsetDifference) / cncserver.canvas.width,
      y: (h - svgOffset.top - margin) / cncserver.canvas.height
    }

    // Use the shorter of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $svg.css({
      'transform': 'scale(' + cncserver.canvas.scale + ')',
      '-webkit-transform': 'scale(' + cncserver.canvas.scale + ')'
    });

    // Fix body background height (html tag backgrounds are weird!)
    $('body').height(h);

    // Log width sizing
    var statusMax = 723;
    var statusThreshold = 1211;
    var $status = $('#status');
    $status.css('left', cncserver.canvas.offset.left - 10);
    if (w < statusThreshold) {
      $status.css('width', statusMax + (w - statusThreshold) + offsetDifference)
    } else {
      $status.css('width', statusMax + offsetDifference)
    }
  }

});
