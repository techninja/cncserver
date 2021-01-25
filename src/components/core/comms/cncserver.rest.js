/**
 * @file Abstraction module for restful helper utilities createServerEndpoint.
 */
import express from 'express'; // Express object (for static).
import { app } from 'cs/server';
import { gConf } from 'cs/settings';
import { getFromRequest } from 'cs/schemas';

/**
  * Wrapper for creating a static (directory reading HTML) endpoint.
  *
  * @param  {string} userPath   [description]
  *   Path a user would enter to get to the content.
  * @param  {string} sourcePath
  *   Path for source files to be served from.
  * @param  {object} options
  *   options object for static serving of files.
  */
export function createStaticEndpoint(userPath, sourcePath, options) {
  app.use(userPath, express.static(sourcePath, options));
}

/**
  * Wrapper for unifying the creation and logic of standard endpoints, their
  * headers and their responses and formats.
  *
  * @param {string} path
  *   Full path of HTTP callback in express path format (can include wildcards)
  * @param {function} callback
  *   Callback triggered on HTTP request
  */
export function createServerEndpoint(path, callback) {
  const what = Object.prototype.toString;
  app.all(path, (req, res) => {
    res.set('Content-Type', 'application/json; charset=UTF-8');
    res.set('Access-Control-Allow-Origin', gConf.get('corsDomain'));

    if (gConf.get('debug') && path !== '/poll') {
      console.log(
        req.route.method.toUpperCase(),
        req.route.path,
        JSON.stringify(req.body)
      );
    }

    // Handle CORS Pre-flight OPTIONS request ourselves
    // TODO: Allow implementers to define options and allowed methods.
    if (req.route.method === 'options') {
      res.set(
        'Access-Control-Allow-Methods',
        'PUT, PATCH, POST, GET, DELETE'
      );
      res.set(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-Width, Content-Type, Accept'
      );

      // Attach the schema and send, if any.
      res.status(200).send(getFromRequest(path));
      return;
    }

    const cbStat = callback(req, res);

    if (cbStat === false) { // Super simple "not supported"
      // Debug Response
      if (gConf.get('debug') && path !== '/poll') {
        console.log('>RESP', req.route.path, 405, 'Not Supported');
      }

      res.status(405).send(JSON.stringify({
        status: 'Not supported',
      }));
    } else if (what.call(cbStat) === '[object Array]') { // Just return message
      // Debug Response
      if (gConf.get('debug') && path !== '/poll') {
        console.log('>RESP', req.route.path, cbStat[0], cbStat[1]);
      }

      // Array format: [/http code/, /status message/]
      res.status(cbStat[0]).send(JSON.stringify({ status: cbStat[1] }));
    } else if (what.call(cbStat) === '[object Object]') { // Full message
      // Debug Response
      if (gConf.get('debug') && path !== '/poll') {
        console.log(
          '>RESP',
          req.route.path,
          cbStat.code,
          JSON.stringify(req.body)
        );
      }

      // Send plaintext if body is string, otherwise convert to JSON.
      if (typeof cbStat.body === 'string') {
        res.set('Content-Type', 'text/plain; charset=UTF-8');
        res.status(cbStat.code).send(cbStat.body);
      } else {
        res.status(cbStat.code).send(JSON.stringify(cbStat.body));
      }
    }
  });
}

/**
  * Standardized response error handler (to be passed to promise catches).
  *
  * The intent is to handle all error objects and give something useful to the
  * client in the message and associated objects. This is curried to hand the catch a
  * new function once we get the local response object.
  *
  * @param {HTTP Response} res
  *   Specific request response object.
  * @param {number} code
  *   Response code to use.
  *
  * @returns {function}
  *   Catch callback that takes a single error object as arg.
  */
export const err = (res, code = 406) => error => {
  const errBody = {
    status: 'error',
    message: error.message || error,
  };

  if (error.allowedValues) errBody.allowedValues = error.allowedValues;
  if (!error.allowedValues && error.stack) errBody.stack = error.stack.split('\n');
  res.status(code).send(errBody);
};
