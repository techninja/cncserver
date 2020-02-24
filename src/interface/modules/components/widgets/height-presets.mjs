/**
 * @file Height preset widget definition with bindings.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';

// Set the height via preset name.
function setHeight(preset) {
  return () => { cncserver.api.pen.height(preset); };
}

// Initialize the widget.
function init(host) {
  if (!host.initialized) {
    host.initialized = true;

    // Bind height change to pen updates.
    cncserver.socket.on('pen update', ({ state }) => {
      host.currentHeight = state;
    });

    // Get all height presets and add them to the host list for rendering.
    cncserver.api.settings.bot().then(({ data: bot }) => {
      host.presets = [...Object.keys(bot.servo.presets)];
    });
  }
}

// Export the widget definition.
export default styles => ({
  currentHeight: '',
  presets: [],

  render: ({ currentHeight, presets }) => html`
    ${styles}
    <label-title icon="arrows-alt-v">Height presets:</label-title>
    ${presets.map(name => html`
      <button-single
        onclick="${setHeight(name)}"
        title="${name}"
        active="${currentHeight === name}"
      ></button-single>
    `)}
    ${init}
  `,
});
