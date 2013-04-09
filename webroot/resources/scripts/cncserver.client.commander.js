/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

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
      cncserver.cmd.executeNext();
    }
  },


  executeNext: function() {
    if (!cncserver.state.buffer.length) {
      cncserver.state.process.busy = false;
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
        cncserver.api.pen.move(next[1], this.cb);
        break;
      case "tool":
        cncserver.api.tools.change(next[1], this.cb);
        break;
      case "up":
        cncserver.api.pen.up(this.cb);
        break;
      case "down":
        cncserver.api.pen.down(this.cb);
        break;
      default:
        console.log('Queue shortcut not found:' + next[0]);
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