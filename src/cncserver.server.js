/**
 * @file Abstraction module for all express/server related code for CNC Server!
 *
 */
const express = require('express'); // Express Webserver Requires
const slashes = require('connect-slashes'); // Middleware to manage URI slashes
const http = require('http');

module.exports = (cncserver) => {
  cncserver.app = express(); // Create router (app).

  // Setup the cental server object.
  cncserver.server = http.createServer(cncserver.app);
  cncserver.srv = {}; // Hold custom functions/wrappers.

  // Global express initialization (must run before any endpoint creation)
  cncserver.app.configure(() => {
    cncserver.app.use('/', express.static(`${__dirname}/../example`));
    cncserver.app.use(express.bodyParser());
    cncserver.app.use(slashes());
  });

  // Start express HTTP server for API on the given port
  let serverStarted = false;

  /**
   * Attempt to start the server.
   */
  cncserver.srv.start = () => {
    // Only run start server once...
    if (serverStarted) return;
    serverStarted = true;

    const hostname = cncserver.gConf.get('httpLocalOnly') ? 'localhost' : null;

    // Catch Addr in Use Error
    cncserver.server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('Address in use, retrying...');
        setTimeout(() => {
          cncserver.srv.close();
          cncserver.server.listen(cncserver.gConf.get('httpPort'), hostname);
        }, 1000);
      }
    });

    cncserver.server.listen(
      cncserver.gConf.get('httpPort'),
      hostname,
      () => {
        // Properly close down server on fail/close
        process.on('SIGTERM', (err) => {
          console.log(err);
          cncserver.srv.close();
        });
      }
    );
  };

  /**
   * Attempt to close down the server.
   */
  cncserver.srv.close = () => {
    try {
      cncserver.server.close();
    } catch (e) {
      console.log("Whoops, server wasn't running.. Oh well.");
    }
  };
};
