/**
 * @file Colorset Editor: edit implement element definition.
 */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';


function implementChange(host, { detail: { data } }) {
  // Assign all data to the object.
  const { color } = host.data;
  host.data = data;
  host.data.color = color;
}

export default (styles) => ({
  initialized: false,
  data: {},

  render: ({ data = {} }) => html`
    ${styles}
    <button-single
      text="Back"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <tool-implement
      type=${data.type}
      handleWidth=${data.handleWidth}
      handleColors=${data.handleColors && data.handleColors.join(',')}
      width=${data.width}
      length=${data.length}
      stiffness=${data.stiffness}
      color=${data.color}
    ></tool-implement>
    <schema-form
      api="colors"
      json-path="$.properties.implement"
      onchange=${implementChange}
      data=${data}
      arrays
      minimal
      plain
    ></schema-form>
  `,
});
