/**
 * @file Top toolbar panel definition with bindings.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { onUpdate } from '/modules/utils/live-state.mjs';

// Initialize the panel.
function init(host) {
  if (!host.initialized) {
    host.initialized = true;

    // Bind to pen updates.
    onUpdate('pen update', ({ state }) => {
      host.penState = state;
    });
  }
}

// TODO: Add support for skip buffer park.
export default styles => ({
  initialized: false,
  penState: 'up',
  render: ({ penState }) => html`
    ${styles}

    <button-single
      text="Park"
      icon="home"
      type="warning"
      onclick="cncserver.api.pen.park()"
    ></button-single>

    <button-single
      text="Unlock & ⇱∅"
      icon="unlock"
      type="secondary"
      onclick="cncserver.api.motors.unlock().then(cncserver.api.pen.zero());"
    ></button-single>

    <button-toggle
      onchange="cncserver.api.pen.height(this.state ? 0 : 1)"
      on-title="Down ⭳"
      on-icon="pen"
      on-type="success"
      off-title="Up ↥"
      off-icon="pen"
      off-type="warning"
      state=${penState === 'up' || penState === 0}
    ></button-toggle>

    <label class="checkbox box is-pulled-right" style="padding: 0.1em 0.5em;">
      Direct
      <input type="checkbox" class="switch" id="skipbuffer">
    </label>
    ${init}
  `,
});
