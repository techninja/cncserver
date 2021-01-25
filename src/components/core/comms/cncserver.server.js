/**
 * @file Abstraction module for all express/server related code for CNC Server!
 *
 */
import express from 'express'; // Express Webserver Requires
import slashes from 'connect-slashes'; // Middleware to manage URI slashes
import http from 'http';
import path from 'path';
import { homedir } from 'os';
import { trigger } from 'cs/binder';
import { gConf } from 'cs/settings';
import { __basedir } from 'cs/utils';

export const app = express(); // Create router (app).

// Setup the cental server object.
export const httpServer = http.createServer(app);

// Global express initialization (must run before any endpoint creation)
app.configure(() => {
  // Base static path for remote interface.
  app.use('/', express.static(path.join(__basedir, 'interface')));

  // Configure module JS file mime type.
  express.static.mime.define({ 'text/javascript': ['mjs'] });

  // Add static libraries from node_modules.
  const nm = path.resolve(__basedir, '..', 'node_modules');

  // Custom static dirs.
  const statics = {
    paper: path.join(nm, 'paper', 'dist'),
    axios: path.join(nm, 'axios', 'dist'),
    jquery: path.join(nm, 'jquery', 'dist'),
    jsonform: path.join(nm, 'jsonform', 'lib'),
    underscore: path.join(nm, 'underscore'),
    bulma: path.join(nm, 'bulma', 'css'),
    chroma: path.join(nm, 'chroma-js'),
    select2: path.join(nm, 'select2', 'dist'),
    jsoneditor: path.join(nm, '@json-editor', 'json-editor', 'dist'),
    bootstrap: path.join(nm, 'bootstrap', 'dist'),
    'font-awesome': path.join(nm, '@fortawesome', 'fontawesome-free', 'css'),
    webfonts: path.join(nm, '@fortawesome', 'fontawesome-free', 'webfonts'),
    modules: path.resolve(__basedir, '..', 'web_modules'),
    home: path.join(path.resolve(homedir(), 'cncserver')),
  };

  // Add routing for all static dirs.
  Object.entries(statics).forEach(([staticPath, dirSource]) => {
    app.use(`/${staticPath}`, express.static(dirSource));
  });

  // Setup remaining middleware.
  app.use(express.bodyParser());
  app.use(slashes());

  // Allow any implementing binder support for middleware or static routes.
  trigger('server.configure', app);
});

// Start express HTTP server for API on the given port
let serverStarted = false;

/**
  * Attempt to close down the server.
  */
export function close() {
  try {
    httpServer.close();
  } catch (e) {
    console.log("Whoops, server wasn't running.. Oh well.");
  }
}
/**
  * Attempt to start the server.
  */
export function start() {
  // Only run start server once...
  if (serverStarted) return;
  serverStarted = true;

  const hostname = gConf.get('httpLocalOnly') ? 'localhost' : null;

  // Catch Addr in Use Error
  httpServer.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log('Address in use, retrying...');
      setTimeout(() => {
        close();
        httpServer.listen(gConf.get('httpPort'), hostname);
      }, 1000);
    }
  });

  httpServer.listen(
    gConf.get('httpPort'),
    hostname,
    () => {
      // Properly close down server on fail/close
      process.on('SIGTERM', err => {
        console.log(err);
        close();
      });
    }
  );
}
