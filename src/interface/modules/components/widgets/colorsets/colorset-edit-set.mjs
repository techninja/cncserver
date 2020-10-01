/**
 * @file Colorset Editor: edit colorset element definition.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';

function saveDone(host) {
  const form = host.shadowRoot.querySelector('schema-form');
  const data = { ...form.editor.data.current };
  delete data.items;

  // TODO: Block input on save wait...
  cncserver.api.colors.editSet(data).then(() => {
    handleSwitch('colors', { reload: true })(host);
  })
}

export default (styles) => ({
  initialized: false,
  data: {},

  render: ({ data }) => html`
    ${styles}
    <style>
      :host {
        padding: 1em;
      }
    </style>
    <button-single
      text="Save"
      icon="save"
      style="success"
      onclick=${saveDone}
    ></button-single>
    <button-single
      text="Cancel"
      icon="ban"
      style="warning"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <schema-form
      api="colors"
      hide-paths="root.items"
      preset-paths="root.implement,root.toolset"
      data=${data}
      plain
    ></schema-form>
    <button-single
      icon="palette"
      text="Load Preset"
      onclick=${handleSwitch('presets')}>
    </button-single>
  `,
});
