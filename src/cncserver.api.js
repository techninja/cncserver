/*jslint node: true */
"use strict";

/**
 * @file Abstraction module for all Restful API related code for CNC Server!
 *
 */

module.exports = function(cncserver) {
  // CNC Server API ============================================================
  // Return/Set CNCServer Configuration ========================================
  cncserver.createServerEndpoint("/v1/settings", function(req){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body: {
        global: '/v1/settings/global',
        bot: '/v1/settings/bot'
      }};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/settings/:type", function(req){
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
      cncserver.control.setPen(req.body, function(stat){
        var code = 200;
        var body = {};

        if (!stat) {
          code = 500;
          body.status = "Error setting pen!";
        } else {
          if (req.body.ignoreTimeout){
            code = 202;
          }
          body = cncserver.pen;
        }

        body = JSON.stringify(body);
        res.status(code).send(body);
        if (cncserver.gConf.get('debug')) {
          console.log(">RESP", req.route.path, code, body);
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    } else if (req.route.method === 'delete'){
      // Reset pen to defaults (park)
      cncserver.control.setHeight('up', function(){
        cncserver.control.setPen({
          x: cncserver.bot.park.x,
          y: cncserver.bot.park.y,
          park: true,
          ignoreTimeout: req.body.ignoreTimeout,
          skipBuffer: req.body.skipBuffer
        }, function(stat){
          var code = 200;
          var body = {};

          if (!stat) {
            code = 500;
            body.status = "Error parking pen!";
          } else {
            body = cncserver.pen;
          }

          body = JSON.stringify(body);
          res.status(code).send(body);
          if (cncserver.gConf.get('debug')) {
            console.log(">RESP", req.route.path, code, body);
          }
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
  cncserver.createServerEndpoint("/v1/motors", function(req){
    // Disable/unlock motors
    if (req.route.method === 'delete') {
      cncserver.run('custom', cncserver.buffer.cmdstr('disablemotors'));
      return [201, 'Disable Queued'];
    } else if (req.route.method === 'put') {
      if (parseInt(req.body.reset, 10) === 1) {
        // ZERO motor position to park position
        var park = cncserver.utils.centToSteps(cncserver.bot.park, true);
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

        cncserver.run('callback', function(){
          // Set actualPen position. This is the ONLY place we set this value
          // without a movement, because it's assumed to have been moved there
          // physically by a user. Also we're assuming they did it instantly!
          cncserver.actualPen.x = park.x;
          cncserver.actualPen.y = park.y;
          cncserver.actualPen.lastDuration = 0;

          cncserver.io.sendPenUpdate();
          if (cncserver.gConf.get('debug')) {
            console.log('Motor offset reset to park position');
          }

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
    var buffer = cncserver.buffer;
    if (req.route.method === 'get' || req.route.method === 'put') {
      // Pause/resume (normalize input)
      if (typeof req.body.paused === "string") {
        req.body.paused = req.body.paused === "true" ? true : false;
      }

      if (typeof req.body.paused === "boolean") {
        if (req.body.paused !== buffer.paused) {

          // If pausing, trigger immediately.
          // Resuming can't do this if returning from another position.
          if (req.body.paused) {
            buffer.pause();
            cncserver.control.setHeight('up', null, true); // Pen up for safety!
            console.log('Run buffer paused!');
          } else {
            console.log('Resume to begin shortly...');
          }

          // Changed to paused!
          buffer.newlyPaused = req.body.paused;
        }
      }

      // Did we actually change position since pausing?
      var changedSincePause = false;
      if (buffer.pausePen) {
        if (buffer.pausePen.x !== cncserver.actualPen.x ||
            buffer.pausePen.y !== cncserver.actualPen.y ||
            buffer.pausePen.height !== cncserver.actualPen.height){
          changedSincePause = true;
          console.log('CHANGED SINCE PAUSE');
        } else {
          // If we're resuming, and there's no change... clear the pause pen
          if (!req.body.paused) {
            console.log('RESUMING NO CHANGE!');
          }
        }
      }

      // Resuming?
      if (!req.body.paused) {
        // Move back to position we paused at (if changed).
        if (changedSincePause) {
          // Remain paused until we've finished...
          console.log('Moving back to pre-pause position...');

          // Set the pen up before moving to resume position
          cncserver.control.setHeight('up', function(){
            cncserver.control.actuallyMove(buffer.pausePen, function(){
              // Set the height back to what it was AFTER moving
              cncserver.control.actuallyMoveHeight(
                buffer.pausePen.height,
                buffer.pausePen.state,
                function(){
                  console.log('Resuming buffer!');
                  buffer.resume();

                  res.status(200).send(JSON.stringify({
                    running: buffer.running,
                    paused: buffer.paused,
                    count: buffer.data.length,
                    buffer: "This isn't a great idea..." // TODO: FIX <<
                  }));

                  if (cncserver.gConf.get('debug')) {
                    console.log(">RESP", req.route.path, '200');
                  }
                }
              );
            });
          }, true); // Skipbuffer on setheight!

          return true; // Don't finish the response till after move back ^^^
        } else {
          // Plain resume.
          buffer.resume();
        }
      }

      // In case paused with 0 items in buffer...
      if (!buffer.newlyPaused || buffer.data.length === 0) {
        buffer.newlyPaused = false;
        cncserver.io.sendBufferVars();
        return {code: 200, body: {
          running: buffer.running,
          paused: buffer.paused,
          count: buffer.data.length
        }};
      } else { // Buffer isn't empty and we're newly paused
        // Wait until last item has finished before returning
        console.log('Waiting for last item to finish...');

        buffer.pauseCallback = function(){
          res.status(200).send(JSON.stringify({
            running: buffer.running,
            paused: buffer.paused,
            count: buffer.length
          }));
          cncserver.io.sendBufferVars();
          buffer.newlyPaused = false;

          if (cncserver.gConf.get('debug')) {
            console.log(">RESP", req.route.path, 200);
          }
        };

        return true; // Don't finish the response till later
      }
    } else if (req.route.method === 'post') {
      // Create a status message/callback and shuck it into the buffer
      if (typeof req.body.message === "string") {
        cncserver.run('message', req.body.message);
        return [200, 'Message added to buffer'];
      } else if (typeof req.body.callback === "string") {
        cncserver.run('callbackname', req.body.callback);
        return [200, 'Callback name added to buffer'];
      } else {
        return [400, '/v1/buffer POST only accepts "message" or "callback"'];
      }
    } else if (req.route.method === 'delete') {
      buffer.clear();
      return [200, 'Buffer Cleared'];
    } else {
      return false;
    }
  });

  // Get/Change Tool API =======================================================
  cncserver.createServerEndpoint("/v1/tools", function(req){
    if (req.route.method === 'get') { // Get list of tools
      return {code: 200, body:{
        tools: Object.keys(cncserver.botConf.get('tools'))
      }};
    } else {
      return false;
    }
  });

  cncserver.createServerEndpoint("/v1/tools/:tool", function(req, res){
    var toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method === 'put') { // Set Tool
      if (cncserver.botConf.get('tools:' + toolName)){
        cncserver.control.setTool(toolName, function(){
          cncserver.pen.tool = toolName;
          res.status(200).send(JSON.stringify({
            status: 'Tool changed to ' + toolName
          }));

          if (cncserver.gConf.get('debug')) {
            console.log(">RESP", req.route.path, 200, 'Tool:' + toolName);
          }
        }, req.body.ignoreTimeout);
        return true; // Tell endpoint wrapper we'll handle the response
      } else {
        return [404, "Tool: '" + toolName + "' not found"];
      }
    } else {
      return false;
    }
  });
};
