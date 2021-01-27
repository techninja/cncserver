/**
 * @file Glue module to manage i18n localization initialization, etc.
 * @see https://www.i18next.com/translation-function/essentials
 */
import i18next from 'i18next';
import i18nextFSBackend from 'i18next-node-fs-backend';
import i18nextMiddleware from 'i18next-express-middleware';
import path from 'path';
import { bindTo } from 'cs/binder';
import { __basedir } from 'cs/utils';

export const i18n = {
  t: s => s,
  n: {},
};

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
      loadPath: path.join(__basedir, 'src', 'locales', '{{ns}}', '{{lng}}.json'),
      addPath: path.join(__basedir, 'src', 'locales', '{{ns}}', '{{lng}}.missing.json'),
    },
  })
  .then(t => {
    i18n.n = i18next;
    i18n.t = t;
  })
  .catch(err => {
    console.log(err);
  });

// Bind to server config to initialize locale detection.
bindTo('server.configure', 'i18n', app => {
  app.use(i18nextMiddleware.handle(i18next));
});
