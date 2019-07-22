/**
 * @file Abstraction module for restful helper utilities createServerEndpoint.
 */
const express = require('express'); // Express object (for static).

const rest = {};

module.exports = (cncserver) => {
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
  rest.createStaticEndpoint = (userPath, sourcePath, options) => {
    cncserver.server.app.use(userPath, express.static(sourcePath, options));
  };

  /**
   * Wrapper for unifying the creation and logic of standard endpoints, their
   * headers and their responses and formats.
   *
   * @param {string} path
   *   Full path of HTTP callback in express path format (can include wildcards)
   * @param {function} callback
   *   Callback triggered on HTTP request
   */
  rest.createServerEndpoint = (path, callback) => {
    const what = Object.prototype.toString;
    cncserver.server.app.all(path, (req, res) => {
      res.set('Content-Type', 'application/json; charset=UTF-8');
      res.set('Access-Control-Allow-Origin', cncserver.settings.gConf.get('corsDomain'));

      if (cncserver.settings.gConf.get('debug') && path !== '/poll') {
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
          'PUT, POST, GET, DELETE'
        );
        res.set(
          'Access-Control-Allow-Headers',
          'Origin, X-Requested-Width, Content-Type, Accept'
        );
        res.status(200).send();
        return;
      }

      const cbStat = callback(req, res);

      if (cbStat === false) { // Super simple "not supported"
        // Debug Response
        if (cncserver.settings.gConf.get('debug') && path !== '/poll') {
          console.log('>RESP', req.route.path, 405, 'Not Supported');
        }

        res.status(405).send(JSON.stringify({
          status: 'Not supported',
        }));
      } else if (what.call(cbStat) === '[object Array]') { // Just return message
        // Debug Response
        if (cncserver.settings.gConf.get('debug') && path !== '/poll') {
          console.log('>RESP', req.route.path, cbStat[0], cbStat[1]);
        }

        // Array format: [/http code/, /status message/]
        res.status(cbStat[0]).send(JSON.stringify({ status: cbStat[1] }));
      } else if (what.call(cbStat) === '[object Object]') { // Full message
        // Debug Response
        if (cncserver.settings.gConf.get('debug') && path !== '/poll') {
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
  };

  // Exports.
  rest.exports = {
    createStaticEndpoint: rest.createStaticEndpoint,
    createServerEndpoint: rest.createServerEndpoint,
  };

  return rest;
};
