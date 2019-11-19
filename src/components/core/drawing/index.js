/**
 * @file Index for all high level drawing components.
 */
/* eslint-disable global-require */
const drawing = {}; // Conglomerated drawing export.

module.exports = (cncserver) => {
  drawing.base = require('./cncserver.drawing.base.js')(cncserver);
  drawing.occlusion = require('./cncserver.drawing.occlusion.js')(cncserver, drawing);
  drawing.trace = require('./cncserver.drawing.trace.js')(cncserver, drawing);
  drawing.fill = require('./cncserver.drawing.fill.js')(cncserver, drawing);
  drawing.vectorize = require('./cncserver.drawing.vectorize.js')(cncserver, drawing);
  drawing.text = require('./cncserver.drawing.text.js')(cncserver, drawing);
  drawing.accell = require('./cncserver.drawing.accell.js')(cncserver, drawing);
  drawing.colors = require('./cncserver.drawing.colors.js')(cncserver, drawing);
  drawing.project = require('./cncserver.drawing.project.js')(cncserver, drawing);
  return drawing;
};
