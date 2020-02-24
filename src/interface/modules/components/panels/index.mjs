/**
 * @file Index for all panels, allows for binding and initialization with styles.
 */
import ToolbarTop from './toolbar-top.mjs';
import ToolbarBottom from './toolbar-bottom.mjs';
import PanelBasic from './panel-basic.mjs';
import PanelAdvanced from './panel-advanced.mjs';
import PanelSettings from './panel-settings.mjs';
import PanelColors from './panel-colors.mjs';
import PanelDiagnostics from './panel-diagnostics.mjs';

export default styles => ({
  'toolbar-top': ToolbarTop(styles),
  'toolbar-bottom': ToolbarBottom(styles),
  'panel-basic': PanelBasic(styles),
  'panel-advanced': PanelAdvanced(styles),
  'panel-settings': PanelSettings(styles),
  'panel-colors': PanelColors(styles),
  'panel-diagnostics': PanelDiagnostics(styles),
});
