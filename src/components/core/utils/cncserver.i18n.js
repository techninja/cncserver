/**
 * @file Glue module to manage i18n localization initialization, etc.
 * @see https://www.i18next.com/translation-function/essentials
 */
const i18next = require('i18next');
const Backend = require('i18next-node-fs-backend');
const path = require('path');

const i18n = { id: 'i18n', t: {} }; // Final Object to be exported.

module.exports = (cncserver) => {
  i18next.use(Backend).init({
    preload: ['ar', 'bn', 'de', 'en-US', 'es', 'fr', 'hi', 'pt', 'ru', 'ur', 'zh-CN'],
    fallbackLng: ['en-US'],
    lng: 'en',
    // debug: true,
    ns: ['common', 'colorsets'],
    defaultNS: 'common',
    backend: {
      loadPath: path.join(global.__basedir, 'locales', '{{ns}}', '{{lng}}.json'),
      addPath: path.join(global.__basedir, 'locales', '{{ns}}', '{{lng}}.missing.json'),
    },
  }).then((t) => {
    i18n.t = t;
    console.log(i18n.t('colorsets:colors.red'));
  }).catch((err) => {
    console.log(err);
  });

  return i18n;
};
