/**
 * @file Index for all machine support components.
 */
import { bindTo } from 'cs/binder';
import { botConf } from 'cs/settings';
import base from 'cs/bots/base';
import ebb from 'cs/bots/ebb';
import watercolorbot from 'cs/bots/watercolorbot';

// Conglomerated bot support export.
export const bots = {
  base: base(),
  ebb: ebb(),
  watercolorbot: watercolorbot(),
};

// Allow each bot support module to enable/disable itself based on setup info.
bindTo('controller.setup', 'bots', () => {
  const conf = botConf.get();
  Object.values(bots).forEach(botSupport => {
    if (typeof botSupport.checkInUse === 'function') {
      botSupport.checkInUse(conf);
    }
  });
});
