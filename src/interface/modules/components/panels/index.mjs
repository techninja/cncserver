/**
 * @file Index for all panels, allows for binding and initialization with styles.
 */
import ToolbarTop from './toolbar-top.mjs';
import ToolbarBottom from './toolbar-bottom.mjs';
import PanelColors from './panel-colors.mjs';

export default styles => ({
  'toolbar-top': ToolbarTop(styles),
  'toolbar-bottom': ToolbarBottom(styles),
  'panel-colors': PanelColors(styles),
});
