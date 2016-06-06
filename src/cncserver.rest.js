"use strict";

/**
 * @file Abstraction module for restful helper utilities createServerEndpoint.
 */

module.exports = function(cncserver) {
  /**
   * Wrapper for unifying the creation and logic of standard endpoints, their
   * headers and their responses and formats.
   *
   * @param {string} path
   *   Full path of HTTP callback in express path format (can include wildcards)
   * @param {function} callback
   *   Callback triggered on HTTP request
   */
  cncserver.createServerEndpoint = function (path, callback){
    var what = Object.prototype.toString;
    cncserver.app.all(path, function(req, res){
      res.set('Content-Type', 'application/json; charset=UTF-8');
      res.set('Access-Control-Allow-Origin', cncserver.gConf.get('corsDomain'));

      if (cncserver.gConf.get('debug') && path !== '/poll') {
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

      var cbStat = callback(req, res);

      if (cbStat === false) { // Super simple "not supported"
        // Debug Response
        if (cncserver.gConf.get('debug') && path !== '/poll') {
          console.log(">RESP", req.route.path, 405, 'Not Supported');
        }

        res.status(405).send(JSON.stringify({
          status: 'Not supported'
        }));
      } else if(what.call(cbStat) === '[object Array]') { // Just return message
        // Debug Response
        if (cncserver.gConf.get('debug') && path !== '/poll') {
          console.log(">RESP", req.route.path, cbStat[0], cbStat[1]);
        }

        // Array format: [/http code/, /status message/]
        res.status(cbStat[0]).send(JSON.stringify({
          status: cbStat[1]
        }));
      } else if(what.call(cbStat) === '[object Object]') { // Full message
        // Debug Response
        if (cncserver.gConf.get('debug') && path !== '/poll') {
          console.log(
            ">RESP",
            req.route.path,
            cbStat.code,
            JSON.stringify(req.body)
          );
        }

        // Send plaintext if body is string, otherwise convert to JSON.
        if (typeof cbStat.body === "string") {
          res.set('Content-Type', 'text/plain; charset=UTF-8');
          res.status(cbStat.code).send(cbStat.body);
        } else {
          res.status(cbStat.code).send(JSON.stringify(cbStat.body));
        }
      }
    });
  };

  // Exports.
  cncserver.exports.createServerEndpoint = cncserver.createServerEndpoint;
};
