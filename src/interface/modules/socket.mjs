/**
 * @file Holds interface controller stuff for the gui.
 */
/* eslint-env browser */
/* globals cncserver, $, cstate, utils */

const socket = {
  init: () => {
    // Preview from CNCserver (Paper to paper connection!)
    cncserver.socket.on('paper preview', ({ paperJSON }) => {
      if (cstate.layers.preview) {
        const { preview } = cstate.layers;
        preview.removeChildren();
        preview.importJSON(paperJSON);
      } else {
        cstate.tempPreview = paperJSON;
      }
    });

    cncserver.socket.on('pen update', (data) => {
      let animPen = {};
      cstate.pen = $.extend({}, data);
      const { pen, lastPen } = cstate;

      /* let d = 'Status =-=-=-=' + '\n';
      d += `draw pos: ${cstate.pen.state  }/${ cstate.pen.height  }\n`;
      d += `tool: ${  pen.tool  }\n`;
      $('#pendata').text(d); */

      // const tween = {};

      if (pen.lastDuration > 250) {
        animPen = $.extend({}, lastPen);
        if (typeof lastPen.x !== 'undefined') {
          $(lastPen).animate({ x: pen.x, y: pen.y }, {
            duration: pen.lastDuration - 5,
            easing: 'linear',
            step(val, fx) {
              animPen[fx.prop] = val;
              cstate.crosshair.position = utils.stepsToPaper(animPen);
            },
            complete: () => {
              // lastPen = $.extend({}, pen);
              // removeSegment(data.bufferHash);
            },
          });
        }

        /* if (typeof lastPen.x !== 'undefined') {
          tween = crosshair.tweenTo({ position: stepsToPaper(pen) }, pen.lastDuration);
          tween.then(() => {
            lastPen = $.extend({}, pen);
          });
        } */
      } else {
        $(lastPen).stop();
        // tween.stop();
        if (cstate.crosshair) {
          cstate.crosshair.position = utils.stepsToPaper(pen);
        }
        cstate.lastPen = $.extend({}, pen);
        // removeSegment(data.bufferHash);
      }
    });


    // Catch when it's time to manually swap pen over.
    cncserver.socket.on('manualswap trigger', ({ index }) => {
      const message = `Your ${cstate.botName} is now ready to draw with ${cstate.colorset[index]}.
      When it's in and ready, click ok.`;
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) {
        cncserver.api.tools.change('manualresume');
      }
    });


    // CNCServer Buffer Change events (for pause, update, or resume)
    cncserver.socket.on('buffer update', (b) => {

      /* // What KIND of buffer update is this?
      switch (b.type) {
        case 'complete':
          buffer = {
            data: b.bufferData,
            list: b.bufferList
          };

          console.dir(b);

          // Process all items to catch us up.
          processBufferBatch(b.bufferList, b.bufferData);
        case 'vars':
          $('#bufrun').text(b.bufferRunning);
          $('#bufpause').text(b.bufferPaused);
          if (b.bufferPausePen) {
            crosshair.position = stepsToPaper(b.bufferPausePen);
          }
          break;

        case 'add':
          buffer.list.unshift(b.hash);
          buffer.data[b.hash] = b.item;

          // If this is a move, display it.
          console.log('Add:', b.hash);
          if (getBufferItemType(b.item) === 'absmove') {
            addSegment(b.item.command.source, b.item.command, b.item.pen.state, b.hash);
            crosshairTip.position = stepsToPaper(b.item.pen);
          }
          break;

        case 'remove':
          var hash = buffer.list.pop();
          delete buffer.data[hash];
          removeSegment(hash);

          console.log('Remove:', hash);
          break;
      }

      $('#bufcount').text(buffer.list.length);

      // Populate buffer list of items
      var $b = $('#buffer');
      $b.find('option').remove();

      for (var i in buffer.list) {
        var cmd = buffer.data[buffer.list[i]].command;

        // Skip the command if it's null
        if (cmd === null) continue;

        if (typeof cmd == "function") cmd = 'callback';

        if (typeof cmd == 'object') {
          if (typeof cmd.type == "string") {
            switch (cmd.type) {
              case 'absmove':
                cmd = 'move: X' + cmd.x + ' Y' + cmd.y;
                break;
              case 'absheight':
                cmd = 'height: ' + cmd.z + ', state:' + cmd.state;
                break;
              case 'message':
                cmd = 'message: ' + cmd.message;
                break;
              case 'callbackname':
                cmd = 'callback: ' + cmd.name;
                break;
              default:
                cmd = cmd.type;
            }
          }
        }

        $b.prepend( $('<option>').text(cmd) );
      } */
    });
  },
};

export default socket;
