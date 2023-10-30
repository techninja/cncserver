/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
import {
  state as bufferState,
  pause,
  resume,
  clear
} from 'cs/buffer';
import { setHeight } from 'cs/pen';
import { state as actualPenState } from 'cs/actualPen';
import { actuallyMove, actuallyMoveHeight } from 'cs/control';
import { gConf } from 'cs/settings';
import { sendBufferVars } from 'cs/sockets';
import run from 'cs/run';
import { trigger } from 'cs/binder';

export const handlers = {};

handlers['/v2/buffer'] = function bufferMain(req, res) {
  if (req.route.method === 'get' || req.route.method === 'put') {
    // Pause/resume (normalize input)
    if (typeof req.body.paused === 'string') {
      req.body.paused = req.body.paused === 'true';
    }

    if (typeof req.body.paused === 'boolean') {
      if (req.body.paused !== bufferState.paused) {
        // If pausing, trigger immediately.
        // Resuming can't do this if returning from another position.
        if (req.body.paused) {
          pause();
          setHeight('up', null, true); // Pen up for safety!
          console.log('Run buffer paused!');
        } else {
          console.log('Resume to begin shortly...');
        }

        // Changed to paused!
        bufferState.newlyPaused = req.body.paused;
      }
    }

    // Did we actually change position since pausing?
    let changedSincePause = false;
    if (bufferState.pausePen && req.route.method === 'put') {
      if (bufferState.pausePen.x !== actualPenState.x
          || bufferState.pausePen.y !== actualPenState.y
          || bufferState.pausePen.height !== actualPenState.height) {
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
        setHeight('up', () => {
          actuallyMove(bufferState.pausePen, () => {
            // Set the height back to what it was AFTER moving
            actuallyMoveHeight(
              bufferState.pausePen.height,
              bufferState.pausePen.state,
              () => {
                console.log('Resuming buffer!');
                resume();

                res.status(200).send(JSON.stringify({
                  running: bufferState.running,
                  paused: bufferState.paused,
                  count: bufferState.data.length,
                  buffer: "This isn't a great idea...", // TODO: FIX <<
                }));

                if (gConf.get('debug')) {
                  console.log('>RESP', req.route.path, '200');
                }
              }
            );
          });
        }, true); // Skipbuffer on setheight!

        return true; // Don't finish the response till after move back ^^^
      }

      // Plain resume.
      resume();
    }

    // In case paused with 0 items in buffer...
    if (!bufferState.newlyPaused || bufferState.data.length === 0) {
      bufferState.newlyPaused = false;
      sendBufferVars();
      return {
        code: 200,
        body: {
          running: bufferState.running,
          paused: bufferState.paused,
          count: bufferState.data.length,
        },
      };
    }

    // Buffer isn't empty and we're newly paused
    // Wait until last item has finished before returning
    console.log('Waiting for last item to finish...');

    bufferState.pauseCallback = () => {
      res.status(200).send(JSON.stringify({
        running: bufferState.running,
        paused: bufferState.paused,
        count: bufferState.length,
      }));
      sendBufferVars();
      bufferState.newlyPaused = false;

      if (gConf.get('debug')) {
        console.log('>RESP', req.route.path, 200);
      }
    };

    return true; // Don't finish the response till later
  }

  if (req.route.method === 'post') {
    // Create a status message/callback and shuck it into the buffer
    if (typeof req.body.message === 'string') {
      run('message', req.body.message);
      return [200, 'Message added to buffer'];
    }

    if (typeof req.body.callback === 'string') {
      run('callbackname', req.body.callback);
      return [200, 'Callback name added to buffer'];
    }

    return [400, '/v2/buffer POST only accepts "message" or "callback"'];
  }

  if (req.route.method === 'delete') {
    trigger('buffer.clear');
    clear();
    return [200, 'Buffer Cleared'];
  }

  // Error to client for unsupported request types.
  return false;
};
