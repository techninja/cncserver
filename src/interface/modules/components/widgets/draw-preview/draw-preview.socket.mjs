/**
 * @file Draw preview socket update code.
 */
/* globals cncserver, window, document */
import { dispatch } from '/modules/hybrids.js';

function paperToMove([x, y]) {
  return { x, y, abs: 'mm' };
}

function stepsToPaper(host, { x, y }) {
  return [x / host.stepsPerMM.x, y / host.stepsPerMM.y];
}

function getColorName(index) {
  return document.querySelector('panel-colors').items.filter(({ name }) => name === index)[0].title;
}

export default function initSocket(host) {
  // Preview & Stage layers from CNCserver (Paper to paper connection!)
  cncserver.socket.on('paper layer', ({ layer, paperJSON }) => {
    if (host.layers) {
      host.layers[layer].removeChildren();
      host.layers[layer].importJSON(paperJSON);
    } else {
      host.socketPayloads = { ...host.socketPayloads, [layer]: paperJSON };
    }

    // Dispatch a named update.
    dispatch(host, 'layerupdate', { detail: { layer } });
  });

  // Catch when it's time to manually swap pen over.
  cncserver.socket.on('manualswap trigger', ({ index }) => {
    const message = `We are now ready to draw with ${getColorName(index)}.
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
  cncserver.socket.on('pen update', ({ x, y, lastDuration: dur }) => {
    // TODO: First payload is too early :/
    if (host.stepsPerMM) {
      host.position = {
        pos: stepsToPaper(host, { x, y }),
        dur,
      };
    } else {
      host.socketPayloads = {
        ...host.socketPayloads,
        position: { x, y },
      };
    }
  });
}
