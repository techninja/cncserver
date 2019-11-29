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
    // Base static path for remote interface.
    server.app.use('/', express.static(`${global.__basedir}/interface/`));

    // Configure module JS file mime type.
    express.static.mime.define({ 'text/javascript': ['mjs'] });

    // Add static libraries from node_modules.
    const nm = `${global.__basedir}/../node_modules`;
    server.app.use('/paper', express.static(`${nm}/paper/dist/`));
    server.app.use('/axios', express.static(`${nm}/axios/dist/`));
    server.app.use('/jquery', express.static(`${nm}/jquery/dist/`));
    server.app.use('/bulma', express.static(`${nm}/bulma/css/`));
    server.app.use('/select2', express.static(`${nm}/select2/dist/`));
    server.app.use('/font-awesome', express.static(`${nm}/@fortawesome/fontawesome-free/css/`));
    server.app.use('/webfonts', express.static(`${nm}/@fortawesome/fontawesome-free/webfonts/`));

    // Setup remaining middleware.
    server.app.use(express.bodyParser());
    server.app.use(slashes());

    // Allow any implementing binder support for middleware or static routes.
    cncserver.binder.trigger('server.configure', server.app);
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
