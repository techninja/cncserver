/**
 * @file Single button element definition.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  title: '',
  icon: '',
  style: 'plain',
  loading: false,
  desc: '',
  fullwidth: false,
  active: false,
  disabled: false,

  render: ({
    style, icon, title, desc, fullwidth, active, disabled, loading
  }) => {
    const linkClasses = { button: true, 'is-active': active, 'is-loading': loading };
    if (style) linkClasses[`is-${style}`] = true;

    return html`
    ${styles}
    <a class="${linkClasses}" disabled=${disabled} style=${{ display: fullwidth ? 'flex' : 'inline-block' }} title="${desc}">
      ${icon && html`<span class="icon"><i class="fas fa-${icon}" aria-hidden="true"></i></span>`}
      ${title && html`<span>${title}</span>`}
    </a>
  `;
  },
});
