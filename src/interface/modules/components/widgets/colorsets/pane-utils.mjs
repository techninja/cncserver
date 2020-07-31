/**
 * @file Colorset Editor: Shared slide/pane management utils.
 */
import { dispatch } from '/modules/hybrids.js';

export function handleSwitch(destination = '', options = {}) {
  return (host) => {
    dispatch(host, 'switchpane', { detail: { destination, options } });
  };
}
