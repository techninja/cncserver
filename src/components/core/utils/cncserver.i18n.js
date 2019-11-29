/**
 * @file Glue module to manage i18n localization initialization, etc.
 * @see https://www.i18next.com/translation-function/essentials
 */
const i18next = require('i18next');
const i18nextFSBackend = require('i18next-node-fs-backend');
const i18nextMiddleware = require('i18next-express-middleware');
const path = require('path');

const i18n = { id: 'i18n', t: {} }; // Final Object to be exported.

module.exports = (cncserver) => {
  // Initialize full i18next stack with middleware.
  i18next
    .use(i18nextMiddleware.LanguageDetector)
    .use(i18nextFSBackend)
    .init({
      preload: ['ar', 'bn', 'de', 'en-US', 'es', 'fr', 'hi', 'pt', 'ru', 'ur', 'zh-CN'],
      fallbackLng: ['en-US'],
      lng: 'en',
      // debug: true,
      ns: ['common', 'colorsets'],
      defaultNS: 'common',
      detection: {
        lookupHeader: 'accept-language',
      },
      backend: {
        loadPath: path.join(global.__basedir, 'locales', '{{ns}}', '{{lng}}.json'),
        addPath: path.join(global.__basedir, 'locales', '{{ns}}', '{{lng}}.missing.json'),
      },
    })
    .then((t) => {
      i18n.n = i18next;
      i18n.t = t;
    })
    .catch((err) => {
      console.log(err);
    });

  // Bind to server config to initialize locale detection.
  cncserver.binder.bindTo('server.configure', i18n.id, (app) => {
    app.use(i18nextMiddleware.handle(i18next));
  });

  return i18n;
};
