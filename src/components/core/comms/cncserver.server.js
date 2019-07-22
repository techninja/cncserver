/**
 * @file Abstraction module for all express/server related code for CNC Server!
 *
 */
const express = require('express'); // Express Webserver Requires
const slashes = require('connect-slashes'); // Middleware to manage URI slashes
const http = require('http');

const server = {}; // Global component export.

module.exports = (cncserver) => {
  server.app = express(); // Create router (app).

  // Setup the cental server object.
  server.httpServer = http.createServer(server.app);

  // Global express initialization (must run before any endpoint creation)
  server.app.configure(() => {
    server.app.use('/', express.static(`${__dirname}/../example`));
    server.app.use(express.bodyParser());
    server.app.use(slashes());
  });

  // Start express HTTP server for API on the given port
  let serverStarted = false;

  /**
   * Attempt to start the server.
   */
  server.start = () => {
    // Only run start server once...
    if (serverStarted) return;
    serverStarted = true;

    const hostname = cncserver.settings.gConf.get('httpLocalOnly') ? 'localhost' : null;

    // Catch Addr in Use Error
    server.httpServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log('Address in use, retrying...');
        setTimeout(() => {
          server.close();
          server.httpServer.listen(cncserver.settings.gConf.get('httpPort'), hostname);
        }, 1000);
      }
    });

    server.httpServer.listen(
      cncserver.settings.gConf.get('httpPort'),
      hostname,
      () => {
        // Properly close down server on fail/close
        process.on('SIGTERM', (err) => {
          console.log(err);
          server.close();
        });
      }
    );
  };

  /**
   * Attempt to close down the server.
   */
  server.close = () => {
    try {
      server.httpServer.close();
    } catch (e) {
      console.log("Whoops, server wasn't running.. Oh well.");
    }
  };

  return server;
};
