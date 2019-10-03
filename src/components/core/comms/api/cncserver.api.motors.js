/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v1/motors'] = function motorsMain(req) {
    // Disable/unlock motors
    if (req.route.method === 'delete') {
      cncserver.run('custom', cncserver.buffer.cmdstr('disablemotors'));
      return [201, 'Disable Queued'];
    }

    if (req.route.method === 'put') {
      if (parseInt(req.body.reset, 10) === 1) {
        // ZERO motor position to park position
        const park = cncserver.utils.centToSteps(cncserver.settings.bot.park, true);
        // It is at this point assumed that one would *never* want to do this as
        // a buffered operation as it implies *manually* moving the bot to the
        // parking location, so we're going to man-handle the variables a bit.
        // completely not repecting the buffer (as really, it should be empty)

        // EDIT: There are plenty of queued operations that don't involve moving
        // the pen that make sense to have in the buffer after a zero operation,
        // not to mention if there are items in the queue during a pause, we
        // should still want the ability to do this.

        // Set tip of buffer to current
        cncserver.pen.forceState({
          x: park.x,
          y: park.y,
        });

        cncserver.run('callback', () => {
          // Set actualPen position. This is the ONLY place we set this value
          // without a movement, because it's assumed to have been moved there
          // physically by a user. Also we're assuming they did it instantly!
          cncserver.actualPen.forceState({
            x: park.x,
            y: park.y,
            lastDuration: 0,
          });

          cncserver.sockets.sendPenUpdate();

          if (cncserver.settings.gConf.get('debug')) {
            console.log('Motor offset reset to park position');
          }
        });

        return [201, 'Motor offset reset to park position queued'];
      }

      return [406, 'Input not acceptable, see API spec for details.'];
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
