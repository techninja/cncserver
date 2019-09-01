/**
 * @file Drawing base code used by other drawing utils.
 */
const { Size, Project } = require('paper');

// Central drawing base export
const base = {};

module.exports = (cncserver) => {
  base.project = {};

  cncserver.binder.bindTo('controller.setup', 'drawing.base', () => {
    const { settings: { bot } } = cncserver;
    // Setup the project with the base cavas size in mm.
    base.size = new Size(
      bot.workArea.width / bot.stepsPerMM.x,
      bot.workArea.height / bot.stepsPerMM.y
    );

    base.project = new Project(base.size);
  });

  return base;
};
