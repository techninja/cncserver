/**
 * @file Colorset Editor: preset loader element definition.
 */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';

export default styles => ({
  initialized: false,

  render: () => html`
    ${styles}
    <button-single
      text="Back"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <div>Presets</div>
  `,
});
