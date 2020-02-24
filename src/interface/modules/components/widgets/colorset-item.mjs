/**
 * @file Colorset single color item element definition.
 */
import { html } from '/modules/hybrids.js';

export default {
  title: 'Color',
  name: 'color0',
  color: '#000000',
  active: false,

  render: ({ title, name, color }) => html`
    <div>${title} - ${name} - ${color}</div>
  `,
};
