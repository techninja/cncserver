/**
 * @file Title label element definition.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  icon: '',
  style: '',
  desc: '',
  fullwidth: false,

  render: ({
    style, icon, desc, fullwidth,
  }) => {
    const labelClasses = { label: true, 'is-fullwidth': fullwidth };
    if (style) labelClasses[`is-${style}`] = true;

    return html`
    ${styles}
    <style>
      :host {
        display: inline-block;
      }

      label {
        cursor: inherit;
      }
    </style>
    <label class="${labelClasses}" title="${desc}">
      ${icon && html`<span class="icon"><i class="fas fa-${icon}" aria-hidden="true"></i></span>`}
      <span><slot></slot></span>
    </label>
    <p></p>
  `;
  },
});
