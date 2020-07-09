/**
 * @file Slide item element definition.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  text: '',
  name: '',
  icon: '',
  active: false,

  // Renders all children (<slot/>) with active class.
  render: ({ active }) => html`
    ${styles}
    <style>
      h1 {
        font-size: 5em;
      }
    </style>
    <div class=${{ active, item: true }}><slot></slot></div>
  `,
});
