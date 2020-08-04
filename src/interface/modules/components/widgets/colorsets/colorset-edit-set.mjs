/**
 * @file Colorset Editor: edit colorset element definition.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';

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
      text="Back to Colors"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <schema-form
      api="colors"
      hide-paths="root.items,root.tools,root.implement"
      data=${data}
      plain
    ></schema-form>
    <div class="control">
      <label-title icon="file-image">Default Implement:</label-title>
      <tool-implement
        type=${data?.implement?.type}
        handleWidth=${data?.implement?.handleWidth}
        handleColors=
          ${data?.implement?.handleColors && data.implement.handleColors.join(',')}
        width=${data?.implement?.width}
        length=${data?.implement?.length}
        stiffness=${data?.implement?.stiffness}
        color=${data?.implement?.color}
      ></tool-implement>
      <button-single
        text="Edit Implement"
        icon="pencil-alt"
        desc="Change attributes of the base colorset implement"
        onclick=
          ${handleSwitch('edit-implement', { destProps: { data: { ...data?.implement || {}, color: '#000000' } } })}
      ></button-single>
      <button-single text="Load Preset" onclick=${handleSwitch('presets')}>
      </button-single>
    </div>
  `,
});
