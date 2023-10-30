/**
 * @file Colorset Editor: Shared slide/pane management utils.
 */
import { dispatch } from '/modules/hybrids.js';

export function handleSwitch(destination = '', options = {}) {
  return host => {
    dispatch(host, 'switchpane', { detail: { destination, options } });
  };
}

export function applyProps(target, props = {}) {
  Object.entries(props).forEach(([key, value]) => {
    if (typeof value === 'object') {
      target[key] = { ...value };
    } else {
      target[key] = value;
    }
  });
}
