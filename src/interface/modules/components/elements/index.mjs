/**
 * @file Index for all elements, allows for binding and initialization with styles.
 */
import TabGroup from './tab-group.mjs';
import TabItem from './tab-item.mjs';
import ButtonToggle from './button-toggle.mjs';
import ButtonSingle from './button-single.mjs';
import LabelTitle from './label-title.mjs';

export default styles => ({
  'tab-item': TabItem,
  'tab-group': TabGroup(styles),
  'button-toggle': ButtonToggle(styles),
  'button-single': ButtonSingle(styles),
  'label-title': LabelTitle(styles),
});
