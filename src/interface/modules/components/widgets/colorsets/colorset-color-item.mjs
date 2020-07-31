/**
 * @file Colorset Editor: single colorset item element definition.
 */
import { html } from '/modules/hybrids.js';

export default {
  id: '',
  name: '',
  color: '#000000',
  usesTool: false,
  type: 'pen',

  render: () => html`
    <div>This element holds data to be rendered in the host.</div>
  `,
};
