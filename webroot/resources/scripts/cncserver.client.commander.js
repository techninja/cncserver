/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

// TODO: DO this better!
var lastlog = {};
var returnPoints = [];
var lastPoint = {};

cncserver.cmd = {
  // CMD specific callback handler
  cb: function(d) {
    // TODO: check for errors

    if (!cncserver.state.buffer.length) {
      cncserver.state.process.busy = false;
      cncserver.state.process.max = 0;
      cncserver.utils.progress({val: 0, max: 0});
    } else {
      // Update the progress bar
      cncserver.utils.progress({
        val: cncserver.state.process.max - cncserver.state.buffer.length,
        max: cncserver.state.process.max
      });

      // Check for paint refill
      if (cncserver.state.pen.distanceCounter > cncserver.config.maxPaintDistance) {
        var returnPoint = returnPoints[returnPoints.length-1] ? returnPoints[returnPoints.length-1] : lastPoint;
        cncserver.wcb.getMorePaint(returnPoint, function(){
          cncserver.api.pen.down(cncserver.cmd.executeNext);
        });
      } else {
        // Execute next command
        cncserver.cmd.executeNext();
      }
    }
  },

  executeNext: function() {
    if (!cncserver.state.buffer.length) {
      cncserver.cmd.cb();
      return;
    } else {
      cncserver.state.process.busy = true;
    };

    var next = cncserver.state.buffer.pop();

    if (typeof next == "string"){
      next = [next];
    }

    switch (next[0]) {
      case "move":
        returnPoints.unshift(next[1]);
        if (returnPoints.length > 4) {
          returnPoints.pop();
        }
        lastPoint = next[1];
        cncserver.api.pen.move(next[1], cncserver.cmd.cb);
        break;
      case "tool":
        cncserver.api.tools.change(next[1], cncserver.cmd.cb);
        break;
      case "up":
        returnPoints = [];
        cncserver.api.pen.up(cncserver.cmd.cb);
        break;
      case "down":
        cncserver.api.pen.down(cncserver.cmd.cb);
        break;
      case "log":
        lastlog = cncserver.utils.log(next[1]);
        cncserver.cmd.cb(true);
        break;
      case "logdone":
        lastlog.logDone(true);
        cncserver.cmd.cb(true);
        break;
      default:
        console.debug('Queue shortcut not found:' + next[0]);
    }
  },

  // Add a command to the queue! format is cmd short name, arguments
  run: function(){
    if (typeof arguments[0] == "object") {
      cncserver.state.process.max+= arguments.length;
      $.each(arguments[0], function(i, args){
        cncserver.state.buffer.unshift(args);
      });
    } else {
      cncserver.state.process.max++;
      cncserver.state.buffer.unshift(arguments);
    }

  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (!cncserver.state.process.busy && cncserver.state.buffer.length) {
    cncserver.cmd.executeNext();
  }
}, 10);