/**
 * @file Tab item element definition.
 */
import { html } from '/modules/hybrids.js';

export default {
  name: '',
  icon: '',
  active: false,

  // Renders children (<slot/>) if active is set to true
  render: ({ active }) => html`${active && html`<slot></slot>`}`,
};
