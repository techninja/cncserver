/**
 * @file Colorset Editor: edit implement element definition.
 */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';


function implementChange(host, { detail: { data } }) {
  const item = document.querySelector('tool-implement');

  // Assign all data to the object.
  item.width = data.width;
  item.type = data.type;
  item.length = data.length;
  item.stiffness = data.stiffness;
  item.type = data.type;
  item.type = data.type;
  item.handleWidth = data.handleWidth;
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
      json-path="$.properties.implement"
      onchange=${implementChange}
    ></schema-form>
  `,
});
