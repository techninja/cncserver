/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

/* globals cncserver */

cncserver.cmd = {
  // Command buffer list
  buffer: [],

  // Processing state
  process: {
    paused: false,
    busy: false,
    max: 0,
  },

  // CMD specific callback handler
  cb: (d) => {
    if (!cncserver.cmd.buffer.length) {
      cncserver.cmd.process.busy = false;
      cncserver.cmd.process.max = 0;
    } else {
      // Check for paint refill
      if (!cncserver.cmd.process.paused) {
        // Execute next command
        cncserver.cmd.executeNext();
      }

      cncserver.cmd.process.pauseCallback();
    }
  },

  executeNext: (executeCallback) => {
    if (!cncserver.cmd.buffer.length) {
      cncserver.cmd.cb();
      return;
    }

    cncserver.cmd.process.busy = true;

    let next = cncserver.cmd.buffer.pop();

    if (typeof next === 'string') {
      next = [next];
    }

    // These are all run as send and forgets, so ignore the timeout.
    switch (next[0]) {
      case 'move':
        console.log(next[1]);
        cncserver.api.pen.move(next[1]).then(cncserver.cmd.cb);
        break;
      case 'tool':
        cncserver.api.tools.change(next[1]).then(cncserver.cmd.cb);
        break;
      case 'up':
        cncserver.api.pen.up().then(cncserver.cmd.cb);
        break;
      case 'down':
        cncserver.api.pen.down().then(cncserver.cmd.cb);
        break;
      case 'status':
        cncserver.utils.status(next[1], next[2]);
        cncserver.cmd.cb(true);
        break;
      case 'park':
        cncserver.api.pen.park().then(cncserver.cmd.cb);
        break;
      case 'custom':
        cncserver.cmd.cb();
        if (next[1]) next[1](); // Run custom passed callback
        break;
      default:
        console.debug(`Queue shortcut not found: ${next[0]}`);
    }
    if (executeCallback) executeCallback();
  },

  // Add a command to the queue! format is cmd short name, arguments
  run: (...args) => {
    if (typeof args[0] === 'object') {
      cncserver.cmd.process.max += args.length;
      $.each(args[0], (i, loopArgs) => {
        cncserver.cmd.buffer.unshift(loopArgs);
      });
    } else {
      cncserver.cmd.process.max++;
      cncserver.cmd.buffer.unshift(args);
    }
  },

  // Clear out the buffer
  clear: () => {
    cncserver.cmd.buffer = [];
  },
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(() => {
  if (!cncserver.cmd.process.busy
      && cncserver.cmd.buffer.length
      && !cncserver.cmd.process.paused) {
    cncserver.cmd.executeNext();
  }
}, 10);
