/**
 * @file Implement/pen status widget and modal change notifier.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';


function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      // Setup socket callbacks.

    }
  });
}

// TODO: What is this?
// - Show Current Color, current implement (image)
// - Show current Z/height vs all heights
// - Add buttons from toolbar top
// - X/Y coordinates in MM (with crosshairs and arrows showing layout)
export default styles => ({
  initialized: false,
  x: 0,
  y: 0,
  z: 0,
  implement: '',
  render: ({ x, y, z }) => html`
    ${styles}
    <style>
      :host {
        display: block;
        border: 2px solid white;
        background-color: #dddddd;
        padding: 0.5em;
      }
    </style>

    <label-title icon="info-circle">Status:</label-title>


    ${init}
  `,
});
