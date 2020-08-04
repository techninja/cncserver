/**
 * @file Colorset Editor: edit single color element definition.
 */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';
/* globals document */

function customizeForm(host, { detail: { form } }) {

  /*
  const button = document.createElement('button-single');
  button.text = 'Override Implement';
  button.icon = 'pencil-alt';
  button.desc = 'Override the colorset implement';
  button.onclick = () => { (host); };

  implement.parentNode.insertBefore(button, implement);
  */
}

export default (styles) => ({
  initialized: false,
  implement: {},
  data: {},

  render: ({ data, implement }) => {
    let implementInherit = true;
    let implementData = {};
    if (data && data.implement) {
      implementInherit = data.implement.type === 'inherit';
      implementData = implementInherit ? implement : data.implement;
      implementData.color = data.color;
    }

    return html`
    ${styles}
    <button-single
      text="Back"
      onclick=${handleSwitch('colors')}
    ></button-single>

    <schema-form
      api="colors"
      json-path="$.properties.items.items"
      onbuild=${customizeForm}
      hide-paths="root.implement"
      data=${data}
      plain
    ></schema-form>

    <tool-implement
      type=${implementData.type}
      handleWidth=${implementData.handleWidth}
      handleColors=${implementData.handleColors && implementData.handleColors.join(',')}
      width=${implementData.width}
      length=${implementData.length}
      stiffness=${implementData.stiffness}
      color=${implementData.color}
    ></tool-implement>
    <button-single
      text=${implementInherit ? 'Override Implement' : 'Edit Implement'}
      icon="pencil-alt"
      desc="Edit the implement associated with this colorset item"
      onclick=${handleSwitch('edit-implement', { destProps: { data: implementData } })}
    ></button-single>
  `;
  },
});
