/**
 * @file Index for all machine support components.
 */
/* eslint-disable global-require */
const bots = {}; // Conglomerated bot support export.

module.exports = (cncserver) => {
  bots.base = require('./cncserver.bots.base.js')(cncserver);
  bots.ebb = require('./cncserver.bots.ebb.js')(cncserver);
  bots.watercolorbot = require('./cncserver.bots.watercolorbot.js')(cncserver);


  // Allow each bot support module to enable/disable itself based on setup info.
  cncserver.binder.bindTo('controller.setup', 'bots', () => {
    const conf = cncserver.settings.botConf.get();
    Object.values(bots).forEach((botSupport) => {
      if (typeof botSupport.checkInUse === 'function') {
        botSupport.checkInUse(conf);
      }
    });
  });

  return bots;
};
