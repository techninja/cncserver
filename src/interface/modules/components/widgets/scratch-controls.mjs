/**
 * @file Scratch API interface widget definition with bindings.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

function turtleMove(direction, amount) {
  return host => {
    cncserver.api.scratch.move(direction, amount).then(({ angle }) => {
      host.angle = parseInt(angle, 10);
    });
  };
}

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      cncserver.api.scratch.stat().then(({ angle }) => {
        host.angle = parseInt(angle, 10);
      });
    }
  });
}

export default styles => ({
  initialized: false,
  angle: 0,
  render: ({ angle }) => html`
    ${styles}
    <label-title icon="location-arrow">Scratch Turtle:</label-title>
    <div class="field">
      <button-single
        onclick="${turtleMove('left', 90)}"
        desc="Turn left 90 degrees"
        icon="undo-alt"
        type="large"
      ></button-single>
      <button-single
        onclick="${turtleMove('forward', 10)}"
        desc="Move forward 10"
        icon="angle-up"
        type="large"
      ></button-single>
      <button-single
        onclick="${turtleMove('forward', 0)}"
        desc="Move to center positon (0)"
        icon="crosshairs"
        type="large"
      ></button-single>
      <button-single
        onclick="${turtleMove('forward', 100)}"
        desc="Move forward 100"
        icon="angle-double-up"
        type="large"
      ></button-single>
      <button-single
        onclick="${turtleMove('right', 90)}"
        desc="Turn right 90 degrees"
        icon="redo-alt"
        type="large"
      ></button-single>

      <span title="Turtle angle" class="icon is-large">
        <i
          class="fas fa-arrow-alt-circle-up fa-3x"
          style="${{ transform: `rotate(${angle}deg)` }}"
        ></i>
      </span>
    </div>
    ${init}
  `,
});
