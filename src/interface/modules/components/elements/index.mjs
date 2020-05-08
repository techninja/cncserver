/**
 * @file Index for all elements, allows for binding and initialization with styles.
 */
import TabGroup from './tab-group.mjs';
import TabItem from './tab-item.mjs';
import ButtonToggle from './button-toggle.mjs';
import ButtonSingle from './button-single.mjs';
import LabelTitle from './label-title.mjs';
import MainTitle from './main-title.mjs';
import PaperCanvas from './paper-canvas.mjs';

export default styles => ({
  'tab-item': TabItem(styles),
  'tab-group': TabGroup(styles),
  'button-toggle': ButtonToggle(styles),
  'button-single': ButtonSingle(styles),
  'label-title': LabelTitle(styles),
  'main-title': MainTitle(styles),
  'paper-canvas': PaperCanvas(),
});
