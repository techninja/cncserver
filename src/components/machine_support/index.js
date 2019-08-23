/**
 * @file Index for all machine support components.
 */
/* eslint-disable global-require */
const bots = {}; // Conglomerated bot support export.

module.exports = (cncserver) => {
  bots.base = require('./cncserver.bots.base.js')(cncserver);
  bots.ebb = require('./cncserver.bots.ebb.js')(cncserver);
  bots.watercolorbot = require('./cncserver.bots.watercolorbot.js')(cncserver);
  return bots;
};
