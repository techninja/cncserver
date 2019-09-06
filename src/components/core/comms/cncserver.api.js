/**
 * @file Abstraction module for all Restful API related code for CNC Server!
 */

const fs = require('fs');
const request = require('request');
const _ = require('underscore');
const querystring = require('querystring');
const pathToRegexp = require('path-to-regexp');

const api = {};

module.exports = (cncserver) => {
  // CNC Server API ============================================================
  // Enpoints are created and assigned via a server path to respond to, and
  // and callback function that manages handles the request and response.
  // We hold all of these in api.handlers to be able to call them
  // directly from the batch API endpoint. These are actually only turned into
  // endpoints at the end via createServerEndpoint().
  api.handlers = {};

  // Return/Set CNCServer Configuration ========================================
  api.handlers['/v1/settings'] = function settingsGet(req) {
    if (req.route.method === 'get') { // Get list of tools
      return {
        code: 200,
        body: {
          global: '/v1/settings/global',
          bot: '/v1/settings/bot',
        },
      };
    }

    return false;
  };

  api.handlers['/v1/settings/:type'] = function settingsMain(req) {
    // Sanity check type
    const setType = req.params.type;
    if (!['global', 'bot'].includes(setType)) {
      return [404, 'Settings group not found'];
    }

    let conf = cncserver.settings.botConf;
    if (setType === 'global') {
      conf = cncserver.settings.gConf;
    }

    function getSettings() {
      let out = {};
      // Clean the output for global as it contains all commandline env vars!
      if (setType === 'global') {
        const g = conf.get();
        for (const [key, value] of Object.entries(g)) {
          if (key === 'botOverride') {
            break;
          }
          out[key] = value;
        }
      } else {
        out = conf.get();
      }
      return out;
    }

    // Get the full list for the type
    if (req.route.method === 'get') {
      return { code: 200, body: getSettings() };
    }
    if (req.route.method === 'put') {
      for (const [key, value] of req.body) {
        conf.set(key, value);
      }
      return { code: 200, body: getSettings() };
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Return/Set PEN state  API =================================================
  api.handlers['/v1/pen'] = function penMain(req, res) {
    if (req.route.method === 'put') {
      // Verify absolute measurement input.
      if (req.body.abs) {
        if (!['in', 'mm'].includes(req.body.abs)) {
          return [
            406,
            'Input not acceptable, absolute measurement must be: in, mm',
          ];
        }

        if (!cncserver.settings.bot.maxAreaMM) {
          return [
            406,
            'Input not acceptable, bot does not support absolute position.',
          ];
        }
      }

      // SET/UPDATE pen status
      cncserver.pen.setPen(req.body, (stat) => {
        let code = 202;
        let body = {};

        if (!stat) {
          code = 500;
          body.status = 'Error setting pen!';
        } else {
          // Wait return.
          if (req.body.waitForCompletion) {
            code = 200;
          }
          body = cncserver.pen.state;
        }

        body = JSON.stringify(body);
        res.status(code).send(body);

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, code, body);
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    }

    if (req.route.method === 'delete') {
      // Reset pen to defaults (park)
      cncserver.pen.park(req.body.skipBuffer, (stat) => {
        let code = 200;
        let body = {};

        if (!stat) {
          code = 500;
          body.status = 'Error parking pen!';
        } else {
          body = cncserver.pen.state;
        }

        body = JSON.stringify(body);
        res.status(code).send(body);

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, code, body);
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    }

    if (req.route.method === 'get') {
      if (req.query.actual) {
        return { code: 200, body: cncserver.actualPen.state };
      }

      return { code: 200, body: cncserver.pen.state };
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Return/Set Motor state API ================================================
  api.handlers['/v1/motors'] = function motorsMain(req) {
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

  // Command buffer API ========================================================
  api.handlers['/v1/buffer'] = function bufferMain(req, res) {
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
      buffer.clear();
      return [200, 'Buffer Cleared'];
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Get/Change Tool API =======================================================
  api.handlers['/v1/tools'] = function toolsGet(req) {
    if (req.route.method === 'get') { // Get list of tools
      return {
        code: 200,
        body: {
          tools: Object.keys(cncserver.settings.botConf.get('tools')),
        },
      };
    }

    // Error to client for unsupported request types.
    return false;
  };

  api.handlers['/v1/tools/:tool'] = function toolsMain(req, res) {
    const toolName = req.params.tool;
    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method === 'put') { // Set Tool
      if (cncserver.settings.botConf.get(`tools:${toolName}`)) {
        cncserver.control.setTool(toolName, () => {
          cncserver.pen.forceState({ tool: toolName });
          res.status(200).send(JSON.stringify({
            status: `Tool changed to ${toolName}`,
          }));

          if (cncserver.settings.gConf.get('debug')) {
            console.log('>RESP', req.route.path, 200, `Tool:${toolName}`);
          }
        }, req.body.waitForCompletion);
        return true; // Tell endpoint wrapper we'll handle the response
      }

      return [404, `Tool: "${toolName}" not found`];
    }

    // Error to client for unsupported request types.
    return false;
  };

  // HIGH Level drawing APIs ===================================================
  api.handlers['/v1/jobs'] = function jobs(req) {
    // Enumerate Jobs.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: cncserver.jobs.getAll(),
      };
    }

    // Add a job.
    if (req.route.method === 'post') {
      return {
        code: 200,
        body: cncserver.jobs.addItem(req.body),
      };
    }

    // Error to client for unsupported request types.
    return false;
  };

  // ===========================================================================
  // Bind all the api.handlers into endpoints ==================================
  // ===========================================================================
  _.each(api.handlers, (callback, path) => {
    cncserver.rest.createServerEndpoint(path, callback);
  });

  /**
   * Return a dummy 'request' or 'response' object for faking express requests.
   *
   * @param  {string} type
   *   Either 'request' or 'response'.
   *
   * @return {object}
   *   The dummy object with minimum required parts for the handlers to use the
   *   same code as the express handler arguments.
   */
  function getDummyObject(type) {
    let out = {};

    switch (type) {
      case 'request':
        out = {
          route: {
            method: '',
            path: '',
          },
          query: {},
          params: {},
          body: {},
        };
        break;

      case 'response':
        out = { status: () => ({ send: () => { } }) };
        break;
      default:
    }

    return out;
  }

  /**
   * Process a flat array of semi-abstracted commands into the queue.
   *
   * @param {array} commands
   *   Flat array of command objects in the following format:
   *   {"[POST|PUT|DELETE] /v1/[ENDPOINT]": {data: 'for the endpoint'}}
   * @param {function} callback
   *   Callback function when command processing is complete.
   * @param {number} index
   *   Array index of commands to process. Ignore/Pass as undefined to init.
   *   Function calls itself via callbacks to ensure delayed api handlers remain
   *   queued in order while async.
   * @param {number} goodCount
   *   Running tally of successful commands, to be returned to callback once
   *   complete.
   */
  function processBatchData(commands, callback, index, goodCount) {
    // Initiate for the first loop run.
    if (typeof index === 'undefined') {
      // eslint-disable-next-line no-param-reassign
      index = 0;
      // eslint-disable-next-line no-param-reassign
      goodCount = 0;

      api.batchRunning = true;
    }

    const command = commands[index];
    if (typeof command !== 'undefined' && api.batchRunning) {
      const key = Object.keys(command)[0];
      const data = command[key];
      const method = key.split(' ')[0];
      let path = key.split(' ')[1].split('?')[0];
      if (path[0] !== '/') path = `/${path}`;

      const query = path.split('?')[1]; // Query params.
      const params = {}; // URL Params.

      // Batch runs are send and forget, force waitForCompletion false.
      data.waitForCompletion = false;

      const req = getDummyObject('request');
      const res = getDummyObject('response');
      let handlerKey = '';

      // Attempt to match the path to a requstHandler by express path match.
      _.each(Object.keys(api.handlers), (pattern) => {
        const keys = [];
        const match = pathToRegexp(pattern, keys).exec(path);
        if (match) {
          handlerKey = pattern;

          // If there's keyed url params, inject them.
          if (keys.length) {
            _.each(keys, (p, id) => {
              params[p.name] = match[id + 1];
            });
          }
        }
      });

      // Fill out request details:
      req.route.method = method.toLowerCase();
      req.route.path = path;
      req.query = query ? querystring.parse(query) : {};
      req.params = params;
      req.body = data;

      // Call the api handler (send and forget via batch!)
      if (api.handlers[handlerKey]) {
        res.status = code => ({
          send: (sendData) => {
            if (cncserver.settings.gConf.get('debug')) {
              console.log(`#${index}, Batch Delay:`, handlerKey, code, sendData);
            }

            if (code.toString()[0] === '2') goodCount++;
            process.nextTick(() => {
              processBatchData(commands, callback, index + 1, goodCount);
            });
          },
        });

        // Naively check to see if the request was successful.
        // Technically if there's a wait for return (=== true), we could only
        // see it in the .status() return callback.
        const response = api.handlers[handlerKey](req, res);
        if (response !== true) {
          if (cncserver.settings.gConf.get('debug')) {
            console.log(`#${index}, Batch Immediate:`, handlerKey, response);
          }

          if (response !== false) goodCount++;
          process.nextTick(() => {
            processBatchData(commands, callback, index + 1, goodCount);
          });
        }
      } else {
        // Unhandled path, not a valid API handler available. Move on.
        processBatchData(commands, callback, index + 1, goodCount);
      }
    } else {
      // We're out of commands, or batch was cancelled.
      api.batchRunning = false;
      if (callback) callback(goodCount);
    }
  }

  // Batch Command API =========================================================
  api.batchRunning = false;
  api.setBatchRunningState = (runningState = false) => {
    api.batchRunning = !!runningState;
  };

  cncserver.rest.createServerEndpoint('/v1/batch', (req, res) => {
    // Create a new batch set.
    if (req.route.method === 'post') {
      // For exceedingly large batches over 50k commands, batching in takes
      // longer than the socket will stay open, so we simply respond with a "201
      // queued" immediately after counting.
      if (req.body.file) {
        const { file } = req.body;

        if (file.substr(0, 4) === 'http') {
          // Internet file.
          request.get(file, (error, response, body) => {
            // Attempt to parse/process data.
            if (body) {
              try {
                const commands = JSON.parse(body);
                res.status(201).send(JSON.stringify({
                  status: `Parsed ${commands.length} commands, queuing`,
                  count: commands.length,
                }));

                processBatchData(commands);
              } catch (err) {
                error = err;
              }
            }

            // Catch response for errors (on parsing or reading).
            if (error) {
              res.status(400).send(JSON.stringify({
                status: `Error reading file "${file}"`,
                remoteHTTPCode: response.statusCode,
                data: error,
              }));
            }
          });
        } else {
          // Local file.
          fs.readFile(file, (error, data) => {
            // Attempt to read the data.
            if (data) {
              try {
                const commands = JSON.parse(data.toString());
                res.status(201).send(JSON.stringify({
                  status: `Parsed ${commands.length} commands, queuing`,
                  count: commands.length,
                }));
                processBatchData(commands);
              } catch (err) {
                error = err;
              }
            }

            // Catch response for errors (on parsing or reading).
            if (error) {
              res.status(400).send(JSON.stringify({
                status: `Error reading file "${file}"`,
                data: error,
              }));
            }
          });
        }
      } else {
        // Raw command data (not from a file);
        try {
          res.status(201).send(JSON.stringify({
            status: `Parsed ${req.body.length} commands, queuing`,
            count: req.body.length,
          }));
          processBatchData(req.body);
        } catch (err) {
          res.status(400).send(JSON.stringify({
            status: 'Error reading/processing batch data',
            data: err,
          }));
        }
      }

      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Error to client for unsupported request types.
    return false;
  });

  return api;
};
