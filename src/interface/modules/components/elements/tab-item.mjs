/**
 * @file Tab item element definition.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  text: '',
  name: '',
  icon: '',
  active: false,

  // Renders children (<slot/>) if active is set to true
  render: ({ active }) => html`
    <style>
      :host {
        display: block;
        position: relative;
        overflow: hidden;
      }
    </style>
    ${active && html`${styles}<slot></slot>
  `}`,
});
