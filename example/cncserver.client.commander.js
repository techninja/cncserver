/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

cncserver.cmd = {
  // Command buffer list
  buffer: [],

  // Processing state
  process: {
    paused: false,
    busy: false,
    max: 0
  },

  // CMD specific callback handler
  cb: function(d) {
    if (!cncserver.cmd.buffer.length) {
      cncserver.cmd.process.busy = false;
      cncserver.cmd.process.max = 0;
    } else {
      // Check for paint refill
      if (!cncserver.cmd.process.paused) {
        // Execute next command
        cncserver.cmd.executeNext();
      } else {
        cncserver.cmd.process.pauseCallback();
      }
    }
  },

  executeNext: function(executeCallback) {
    if (!cncserver.cmd.buffer.length) {
      cncserver.cmd.cb();
      return;
    } else {
      cncserver.cmd.process.busy = true;
    };

    var next = cncserver.cmd.buffer.pop();

    if (typeof next == "string"){
      next = [next];
    }

    switch (next[0]) {
      case "move":
        cncserver.api.pen.move(next[1], cncserver.cmd.cb);
        break;
      case "tool":
        cncserver.api.tools.change(next[1], cncserver.cmd.cb);
        break;
      case "up":
        cncserver.api.pen.up(cncserver.cmd.cb);
        break;
      case "down":
        cncserver.api.pen.down(cncserver.cmd.cb);
        break;
      case "status":
        cncserver.utils.status(next[1], next[2]);
        cncserver.cmd.cb(true);
        break;
      case "wash":
        cncserver.wcb.fullWash(cncserver.cmd.cb);
        break;
      case "park":
        cncserver.api.pen.park(cncserver.cmd.cb);
        break;
      case "custom":
        cncserver.cmd.cb();
        if (next[1]) next[1](); // Run custom passed callback
        break;
      default:
        console.debug('Queue shortcut not found:' + next[0]);
    }
    if (executeCallback) executeCallback();
  },

  // Add a command to the queue! format is cmd short name, arguments
  run: function(){
    if (typeof arguments[0] == "object") {
      cncserver.cmd.process.max+= arguments.length;
      $.each(arguments[0], function(i, args){
        cncserver.cmd.buffer.unshift(args);
      });
    } else {
      cncserver.cmd.process.max++;
      cncserver.cmd.buffer.unshift(arguments);
    }
  },

  // Clear out the buffer
  clear: function() {
    cncserver.cmd.buffer = [];
  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (!cncserver.cmd.process.busy && cncserver.cmd.buffer.length && !cncserver.cmd.process.paused) {
    cncserver.cmd.executeNext();
  }
}, 10);
