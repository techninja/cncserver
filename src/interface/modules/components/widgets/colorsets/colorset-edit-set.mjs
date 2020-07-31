/**
 * @file Colorset Editor: edit colorset element definition.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';


function customizeForm(host, { detail: { form } }) {

}

export default styles => ({
  initialized: false,

  render: () => html`
    ${styles}
    <style>
      :host {
        padding: 1em;
      }
    </style>
    <button-single
      text="Back to Colors"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <schema-form
      api="colors"
      onbuild=${customizeForm}
      hide-paths="root.items,root.tools,root.implement"
    ></schema-form>
    <div class="control">
      <label-title icon="file-image">Replace Current:</label-title>
      <button-single text="Replace with Preset" onclick=${handleSwitch('presets')}>
      </button-single>
    </div>
  `,
});
