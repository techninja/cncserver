/**
 * @file Draw preview socket update code.
 */
/* globals cncserver */
import { dispatch } from '/modules/hybrids.js';

export default function initSocket(host) {
  // Preview & Stage layers from CNCserver (Paper to paper connection!)
  cncserver.socket.on('paper layer', ({ layer, paperJSON }) => {
    if (host.layers) {
      host.layers[layer].removeChildren();
      host.layers[layer].importJSON(paperJSON);
    } else {
      host.layerPayloads = { ...host.layerPayloads, [layer]: paperJSON };
    }

    // Dispatch a named update.
    dispatch(host, 'layerupdate', { detail: { layer } });
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

  // Initially set the pen from the bot
  /* cncserver.api.pen.stat().then(res => {
    cstate.pen = res.data;
    cstate.lastPen = $.extend({}, res.data);
    // This is always the correct tip of the buffer.
    cstate.crosshairTip.position = utils.stepsToPaper(cstate.pen);

    // Assume this is also where the bot is (idle, no buffer).
    cstate.crosshair.position = utils.stepsToPaper(cstate.pen);
  }); */

  // Update pen positions
  // TODO: This needs an overhaul, no jQuery
  /* cncserver.socket.on('pen update', data => {
    let animPen = {};
    state.pen = { ...data };
    const { pen, lastPen } = state;

    if (pen.lastDuration > 250) {
      animPen = { ...lastPen };
      if (typeof lastPen.x !== 'undefined') {
        $(lastPen).animate(
          { x: pen.x, y: pen.y },
          {
            duration: pen.lastDuration - 5,
            easing: 'linear',
            step(val, fx) {
              animPen[fx.prop] = val;
              currentPos.position = utils.stepsToPaper(animPen);
            },
            complete: () => {
              // lastPen = $.extend({}, pen);
              // removeSegment(data.bufferHash);
            },
          }
        );
      }
    } else {
      $(lastPen).stop();
      if (currentPos) {
        currentPos.position = utils.stepsToPaper(pen);
      }
      state.lastPen = { ...pen };
      // removeSegment(data.bufferHash);
    }
  }); */
}
