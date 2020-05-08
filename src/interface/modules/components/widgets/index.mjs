/**
 * @file Index for all widgets (groups of elements that go in panels),
 * allows for binding and initialization with styles.
 */
import ColorsetEditor from './colorset-editor.mjs';
import ColorsetItem from './colorset-item.mjs';
import HeightSettings from './height-settings.mjs';
import HeightPresets from './height-presets.mjs';
import ToolsBasic from './tools-basic.mjs';
import ScratchControls from './scratch-controls.mjs';
import ProjectLoader from './project-loader.mjs';
import ContentImporter from './content-importer.mjs';
import CanvasCompose from './canvas/canvas-compose.mjs';
import CanvasPrint from './canvas/canvas-print.mjs';
import DrawSettings from './draw-settings.mjs';

export default styles => ({
  'colorset-item': ColorsetItem,
  'colorset-editor': ColorsetEditor(styles),
  'height-settings': HeightSettings(styles),
  'tools-basic': ToolsBasic(styles),
  'scratch-controls': ScratchControls(styles),
  'height-presets': HeightPresets(styles),
  'project-loader': ProjectLoader(styles),
  'canvas-compose': CanvasCompose(styles),
  'canvas-print': CanvasPrint(styles),
  'draw-settings': DrawSettings(styles),
  'content-importer': ContentImporter(styles),
});
