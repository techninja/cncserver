/**
 * @file Index for all elements, allows for binding and initialization with styles.
 */
import TabGroup from './tab-group.mjs';
import TabItem from './tab-item.mjs';
import SlideGroup from './slide-group.mjs';
import SlideItem from './slide-item.mjs';
import ButtonToggle from './button-toggle.mjs';
import ButtonSingle from './button-single.mjs';
import LabelTitle from './label-title.mjs';
import MainTitle from './main-title.mjs';
import PaperCanvas from './paper-canvas.mjs';
import SchemaForm from './schema-form.mjs';
import ToolImplement from './tool-implement.mjs';
import ColorSet from './color-set.mjs';

export default styles => ({
  'tab-item': TabItem(styles),
  'tab-group': TabGroup(styles),
  'slide-item': SlideItem(styles),
  'slide-group': SlideGroup(styles),
  'button-toggle': ButtonToggle(styles),
  'button-single': ButtonSingle(styles),
  'label-title': LabelTitle(styles),
  'main-title': MainTitle(styles),
  'paper-canvas': PaperCanvas(),
  'schema-form': SchemaForm(styles),
  'tool-implement': ToolImplement(styles),
  'color-set': ColorSet(styles),
});
