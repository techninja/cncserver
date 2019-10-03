/**
 * @file Abstraction module for all Restful API related code for CNC Server!
 */

const fs = require('fs');
const request = require('request');
const _ = require('underscore');
const querystring = require('querystring');
const pathToRegexp = require('path-to-regexp');
const handlerResolve = require('./api');

const api = {};

module.exports = (cncserver) => {
  // CNC Server API ============================================================
  // Enpoints are created and assigned via a server path to respond to, and
  // and callback function that manages handles the request and response.
  // We hold all of these in api.handlers to be able to call them
  // directly from the batch API endpoint. These are actually only turned into
  // endpoints at the end via createServerEndpoint().
  api.handlers = handlerResolve(cncserver);
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
