/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v1/buffer'] = function bufferMain(req, res) {
    const { buffer } = cncserver;
    if (req.route.method === 'get' || req.route.method === 'put') {
      // Pause/resume (normalize input)
      if (typeof req.body.paused === 'string') {
        req.body.paused = req.body.paused === 'true';
      }

      if (typeof req.body.paused === 'boolean') {
        if (req.body.paused !== buffer.paused) {
          // If pausing, trigger immediately.
          // Resuming can't do this if returning from another position.
          if (req.body.paused) {
            buffer.pause();
            cncserver.pen.setHeight('up', null, true); // Pen up for safety!
            console.log('Run buffer paused!');
          } else {
            console.log('Resume to begin shortly...');
          }

          // Changed to paused!
          buffer.newlyPaused = req.body.paused;
        }
      }

      // Did we actually change position since pausing?
      let changedSincePause = false;
      if (buffer.pausePen) {
        if (buffer.pausePen.x !== cncserver.actualPen.state.x
            || buffer.pausePen.y !== cncserver.actualPen.state.y
            || buffer.pausePen.height !== cncserver.actualPen.state.height) {
          changedSincePause = true;
          console.log('CHANGED SINCE PAUSE');
        } else if (!req.body.paused) {
          // If we're resuming, and there's no change... clear the pause pen
          console.log('RESUMING NO CHANGE!');
        }
      }

      // Resuming?
      if (!req.body.paused) {
        // Move back to position we paused at (if changed).
        if (changedSincePause) {
          // Remain paused until we've finished...
          console.log('Moving back to pre-pause position...');

          // Set the pen up before moving to resume position
          cncserver.pen.setHeight('up', () => {
            cncserver.control.actuallyMove(buffer.pausePen, () => {
              // Set the height back to what it was AFTER moving
              cncserver.control.actuallyMoveHeight(
                buffer.pausePen.height,
                buffer.pausePen.state,
                () => {
                  console.log('Resuming buffer!');
                  buffer.resume();

                  res.status(200).send(JSON.stringify({
                    running: buffer.running,
                    paused: buffer.paused,
                    count: buffer.data.length,
                    buffer: "This isn't a great idea...", // TODO: FIX <<
                  }));

                  if (cncserver.settings.gConf.get('debug')) {
                    console.log('>RESP', req.route.path, '200');
                  }
                }
              );
            });
          }, true); // Skipbuffer on setheight!

          return true; // Don't finish the response till after move back ^^^
        }

        // Plain resume.
        buffer.resume();
      }

      // In case paused with 0 items in buffer...
      if (!buffer.newlyPaused || buffer.data.length === 0) {
        buffer.newlyPaused = false;
        cncserver.sockets.sendBufferVars();
        return {
          code: 200,
          body: {
            running: buffer.running,
            paused: buffer.paused,
            count: buffer.data.length,
          },
        };
      }

      // Buffer isn't empty and we're newly paused
      // Wait until last item has finished before returning
      console.log('Waiting for last item to finish...');

      buffer.pauseCallback = () => {
        res.status(200).send(JSON.stringify({
          running: buffer.running,
          paused: buffer.paused,
          count: buffer.length,
        }));
        cncserver.sockets.sendBufferVars();
        buffer.newlyPaused = false;

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, 200);
        }
      };

      return true; // Don't finish the response till later
    }

    if (req.route.method === 'post') {
      // Create a status message/callback and shuck it into the buffer
      if (typeof req.body.message === 'string') {
        cncserver.run('message', req.body.message);
        return [200, 'Message added to buffer'];
      }

      if (typeof req.body.callback === 'string') {
        cncserver.run('callbackname', req.body.callback);
        return [200, 'Callback name added to buffer'];
      }

      return [400, '/v1/buffer POST only accepts "message" or "callback"'];
    }

    if (req.route.method === 'delete') {
      cncserver.binder.trigger('buffer.clear');
      buffer.clear();
      return [200, 'Buffer Cleared'];
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
