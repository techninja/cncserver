/*jslint node: true */
"use strict";

/**
 * @file Abstraction module for all Restful API related code for CNC Server!
 *
 */

module.exports = function(cncserver) {
  // CNC Server API ============================================================
  // Return/Set CNCServer Configuration ========================================
  cncserver.createServerEndpoint("/v1/settings", function(req, res){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body: {
        global: '/v1/settings/global',
        bot: '/v1/settings/bot'
      }};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/settings/:type", function(req, res){
    // Sanity check type
    var setType = req.params.type;
    if (setType !== 'global' && setType !== 'bot'){
      return [404, 'Settings group not found'];
    }

    var conf = setType === 'global' ? cncserver.gConf : cncserver.botConf;

    function getSettings() {
      var out = {};
      // Clean the output for global as it contains all commandline env vars!
      if (setType === 'global') {
        var g = conf.get();
        for (var i in g) {
          if (i === "botOverride") {
            break;
          }
          out[i] = g[i];
        }
      } else {
        out = conf.get();
      }
      return out;
    }

    // Get the full list for the type
    if (req.route.method === 'get') {
      return {code: 200, body: getSettings()};
    } else if (req.route.method === 'put') {
      for (var i in req.body) {
        conf.set(i, req.body[i]);
      }
      return {code: 200, body: getSettings()};
    } else {
      return false;
    }
  });

  // Return/Set PEN state  API =================================================
  cncserver.createServerEndpoint("/v1/pen", function(req, res){
    if (req.route.method === 'put') {
      // SET/UPDATE pen status
      setPen(req.body, function(stat){
        if (!stat) {
          res.status(500).send(JSON.stringify({
            status: "Error setting pen!"
          }));
        } else {
          if (req.body.ignoreTimeout){
            res.status(202).send(JSON.stringify(cncserver.pen));
          }
          res.status(200).send(JSON.stringify(cncserver.pen));
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method === 'delete'){
      // Reset pen to defaults (park)
      setHeight('up', function(){
        setPen({
          x: cncserver.bot.park.x,
          y: cncserver.bot.park.y,
          park: true,
          ignoreTimeout: req.body.ignoreTimeout,
          skipBuffer: req.body.skipBuffer
        }, function(stat){
          if (!stat) {
            res.status(500).send(JSON.stringify({
              status: "Error parking pen!"
            }));
          }
          res.status(200).send(JSON.stringify(cncserver.pen));
        });
      }, req.body.skipBuffer);

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method === 'get'){
      if (req.query.actual) {
        return {code: 200, body: cncserver.actualPen};
      } else {
        return {code: 200, body: cncserver.pen};
      }
    } else  {
      return false;
    }
  });

  // Return/Set Motor state API ================================================
  cncserver.createServerEndpoint("/v1/motors", function(req, res){
    // Disable/unlock motors
    if (req.route.method === 'delete') {
      run('custom', cmdstr('disablemotors'));
      return [201, 'Disable Queued'];
    } else if (req.route.method === 'put') {
      if (req.body.reset == 1) {
        // ZERO motor position to park position
        var park = centToSteps(cncserver.bot.park, true);
        // It is at this point assumed that one would *never* want to do this as
        // a buffered operation as it implies *manually* moving the bot to the
        // parking location, so we're going to man-handle the variables a bit.
        // completely not repecting the buffer (as really, it should be empty)

        // EDIT: There are plenty of queued operations that don't involve moving
        // the pen that make sense to have in the buffer after a zero operation,
        // not to mention if there are items in the queue during a pause, we
        // should still want the ability to do this.

        // Set tip of buffer to current
        cncserver.pen.x = park.x;
        cncserver.pen.y = park.y;

        run('callback', function(){
          // Set actualPen position. This is the ONLY place we set this value
          // without a movement, because it's assumed to have been moved there
          // physically by a user. Also we're assuming they did it instantly!
          cncserver.actualPen.x = park.x;
          cncserver.actualPen.y = park.y;
          cncserver.actualPen.lastDuration = 0;

          sendPenUpdate();
          if (cncserver.gConf.get('debug')) console.log('Motor offset reset to park position');
        });
        return [201, 'Motor offset reset to park position queued'];
      } else {
        return [406, 'Input not acceptable, see API spec for details.'];
      }
    } else {
      return false;
    }
  });

  // Command buffer API ========================================================
  cncserver.createServerEndpoint("/v1/buffer", function(req, res){
    if (req.route.method === 'get' || req.route.method === 'put') {
      // Pause/resume (normalize input)
      if (typeof req.body.paused === "string") {
        req.body.paused = req.body.paused === "true" ? true : false;
      }

      if (typeof req.body.paused === "boolean") {
        if (req.body.paused != bufferPaused) {
          bufferPaused = req.body.paused;
          console.log('Run buffer ' + (bufferPaused ? 'paused!': 'resumed!'));
          bufferRunning = false; // Force a followup check as the paused var has changed

          bufferNewlyPaused = bufferPaused; // Changed to paused!
          sendBufferVars();

          // Hold on the current actualPen to return to before resuming
          if (bufferPaused) {
            bufferPausePen = extend({}, cncserver.actualPen);
            sendBufferVars();
            setHeight('up', null, true); // Pen up for safety!
          }
        }
      }

      // Did we actually change position since pausing?
      var changedSincePause = false;
      if (bufferPausePen) {
        if (bufferPausePen.x != cncserver.actualPen.x ||
            bufferPausePen.y != cncserver.actualPen.y ||
            bufferPausePen.height != cncserver.actualPen.height){
          changedSincePause = true;
        } else {
          // If we're resuming, and there's no change... clear the pause pen
          if (!bufferPaused) {
            bufferPausePen = null;
            sendBufferVars();
          }
        }
      }

      // Resuming? Move back to position we paused at (if changed)
      if (!bufferPaused && changedSincePause) {
        bufferPaused = true; // Pause for a bit until we move back to last pos
        sendBufferVars();
        console.log('Moving back to pre-pause position...');

        // Set the pen up before moving to resume position
        setHeight('up', function(){
          actuallyMove(bufferPausePen, function(){
            // Set the height back to what it was AFTER moving
            actuallyMoveHeight(bufferPausePen.height, bufferPausePen.state, function(){
              console.log('Resuming buffer!');
              bufferPaused = false;
              bufferPausePen = null;
              sendBufferVars();
              res.status(200).send(JSON.stringify({
                running: bufferRunning,
                paused: bufferPaused,
                count: buffer.length,
                buffer: buffer
              }));
            });
          });
        }, true); // Skipbuffer on setheight!

        return true; // Don't finish the response till after move back ^^^
      }


      if (!bufferNewlyPaused || buffer.length === 0) {
        bufferNewlyPaused = false; // In case paused with 0 items in buffer
        sendBufferVars();
        return {code: 200, body: {
          running: bufferRunning,
          paused: bufferPaused,
          count: buffer.length
        }};
      } else { // Buffer isn't empty and we're newly paused
        // Wait until last item has finished before returning
        console.log('Waiting for last item to finish...');

        bufferPauseCallback = function(){
          res.status(200).send(JSON.stringify({
            running: bufferRunning,
            paused: bufferPaused,
            count: buffer.length
          }));
          sendBufferVars();
          bufferNewlyPaused = false;
        };

        return true; // Don't finish the response till later
      }
    } else if (req.route.method === 'post') {
      // Create a status message/callback and shuck it into the buffer
      if (typeof req.body.message === "string") {
        run('message', req.body.message);
        return [200, 'Message added to buffer'];
      } else if (typeof req.body.callback === "string") {
        run('callbackname', req.body.callback);
        return [200, 'Callback name added to buffer'];
      } else {
        return [400, '/v1/buffer POST only accepts data "message" or "callback"'];
      }
    } else if (req.route.method === 'delete') {
      cncserver.clearBuffer();
      bufferRunning = false;

      bufferPausePen = null; // Resuming with an empty buffer is silly
      bufferPaused = false;

      sendBufferComplete(); // SHould be fine to send as buffer is empty.

      console.log('Run buffer cleared!');
      return [200, 'Buffer Cleared'];
    } else {
      return false;
    }
  });

  // Get/Change Tool API =======================================================
  cncserver.createServerEndpoint("/v1/tools", function(req, res){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body:{tools: Object.keys(cncserver.botConf.get('tools'))}};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/tools/:tool", function(req, res){
    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method === 'put') { // Set Tool
      if (cncserver.botConf.get('tools:' + toolName)){
        setTool(toolName, function(data){
          cncserver.pen.tool = toolName;
          res.status(200).send(JSON.stringify({
            status: 'Tool changed to ' + toolName
          }));
        }, req.body.ignoreTimeout);
        return true; // Tell endpoint wrapper we'll handle the response
      } else {
        return [404, "Tool: '" + toolName + "' not found"];
      }
    } else {
      return false;
    }
  });
}
