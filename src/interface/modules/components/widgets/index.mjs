/**
 * @file Index for all widgets (groups of elements that go in panels),
 * allows for binding and initialization with styles.
 */

import HeightSettings from './height-settings.mjs';
import HeightPresets from './height-presets.mjs';
import ToolsBasic from './tools-basic.mjs';
import ScratchControls from './scratch-controls.mjs';
import ProjectLoader from './project-loader.mjs';
import ContentImporter from './content-importer.mjs';
import CanvasCompose from './canvas/canvas-compose.mjs';
import CanvasPrint from './canvas/canvas-print.mjs';
import DrawSettings from './draw-settings.mjs';
import ImplementStatus from './implement-status.mjs';

// Colorset Editor and associated components.
import ColorsetEditor from './colorsets/colorset-editor.mjs';
import ColorsetColors from './colorsets/colorset-colors.mjs';
import ColorsetEditColor from './colorsets/colorset-edit-color.mjs';
import ColorsetEditImplement from './colorsets/colorset-edit-implement.mjs';
import ColorsetEditSet from './colorsets/colorset-edit-set.mjs';
import ColorsetPresets from './colorsets/colorset-presets.mjs';

// Preset selection interfaces and associated components.
import PresetSelectImplement from './preset-select/preset-select-implement.mjs';
import PresetSelectToolset from './preset-select/preset-select-toolset.mjs';

export default styles => ({
  'height-settings': HeightSettings(styles),
  'tools-basic': ToolsBasic(styles),
  'scratch-controls': ScratchControls(styles),
  'height-presets': HeightPresets(styles),
  'project-loader': ProjectLoader(styles),
  'canvas-compose': CanvasCompose(styles),
  'canvas-print': CanvasPrint(styles),
  'draw-settings': DrawSettings(styles),
  'content-importer': ContentImporter(styles),
  'implement-status': ImplementStatus(styles),

  // Colorset editor components.
  'colorset-editor': ColorsetEditor(styles),
  'colorset-colors': ColorsetColors(styles),
  'colorset-edit-color': ColorsetEditColor(styles),
  'colorset-edit-implement': ColorsetEditImplement(styles),
  'colorset-edit-set': ColorsetEditSet(styles),
  'colorset-presets': ColorsetPresets(styles),

  // Preset Selection widgets.
  'preset-select-implement': PresetSelectImplement(styles),
  'preset-select-toolset': PresetSelectToolset(styles),
});
