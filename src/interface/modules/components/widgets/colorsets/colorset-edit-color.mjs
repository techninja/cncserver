/**
 * @file Colorset Editor: edit single color element definition.
 */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';
/* globals document */

function customizeForm(host, { detail: { form } }) {
  // Hide the implement form, we put this on a different slide.
  const implement = form.querySelector('div[data-schemapath="root.implement"]');
  implement.style.display = 'none';

  const button = document.createElement('button-single');
  button.text = 'Override Implement';
  button.icon = 'pencil-alt';
  button.desc = 'Override the colorset implement';
  button.onclick = () => { handleSwitch('edit-implement')(host); };

  implement.parentNode.insertBefore(button, implement);
}

export default styles => ({
  initialized: false,

  render: () => html`
    ${styles}
    <button-single
      text="Back"
      onclick=${handleSwitch('colors')}
    ></button-single>

    <schema-form
      api="colors"
      json-path="$.properties.items.items"
      onbuild=${customizeForm}
    ></schema-form>
  `,
});
