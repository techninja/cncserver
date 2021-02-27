/**
 * @file Implement/pen status widget and modal change notifier.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

function getImplement(host) {
  //cncserver.api.colors.get(host.tool);
}

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      // Setup socket callbacks.
      cncserver.api.pen.stat().then(({ data }) => {
        host.tool = data.tool;
        getImplement(host);
      });

      // Bind to pen updates.
      cncserver.socket.on('pen update', ({ state }) => {
        //host.penState = state;
      });

      // Catch when it's time to manually swap pen over.
      cncserver.socket.on('manualswap trigger', ({ index }) => {
        cncserver.api.colors
          .get(index)
          .then(({ data: { name, implement } }) => {
            host.modalActive = true;
            host.newImplement = implement;
            host.newColor;
          });
      });
    }
  });
}

function hideModal(host) {
  host.modalActive = false;
}

// TODO: What is this?
// - Show Current Color, current implement (image)
// - Show current Z/height vs all heights
// - Add buttons from toolbar top
// - X/Y coordinates in MM (with crosshairs and arrows showing layout)
export default (styles) => ({
  initialized: false,
  x: 0,
  y: 0,
  z: 0,
  modalActive: false,
  color: '#000000',
  newColor: '#0000FF',
  tool: 'color0',
  implement: 'crayola-size-3-brush',
  newImplement: 'crayola-broad-line-marker',
  render: ({
    x,
    y,
    z,
    implement,
    newImplement,
    modalActive,
    color,
    newColor,
  }) => html`
    ${styles}
    <style>
      :host {
        display: block;
        border: 2px solid white;
        background-color: #dddddd;
        padding: 0.5em;
      }

      div.implements {
        text-align: center;
        margin-bottom: 1em;
      }

      div.buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-gap: 1em;
        margin-bottom: 1em;
      }
    </style>

    <notify-modal
      header="Time to change the implement:"
      message=${`Please remove ${implement}, we are now ready to draw with ${newImplement}.`}
      type="success"
      onclose=${hideModal}
      active=${modalActive}
    >
      <div class="implements">
        <tool-implement
          preset=${implement}
          color=${color}
          scale="5"
          plain
        ></tool-implement>
        <span class="icon">
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </span>
        <tool-implement
          preset=${newImplement}
          color=${newColor}
          scale="5"
          plain
        ></tool-implement>
      </div>
      <div class="buttons">
        <button-single
          icon="clock"
          onclick=${hideModal}
          text="I'm not ready yet."
          type="danger"
          fullwidth
        ></button-single>
        <button-single
          icon="check"
          onclick=${hideModal}
          text=${`${newImplement} is ready`}
          type="success"
          fullwidth
        ></button-single>
      </div>
    </notify-modal>
    <label-title icon="info-circle">Status:</label-title>
    <div>
      <tool-implement preset=${implement} color=${color} plain></tool-implement>
    </div>

    ${init}
  `,
});
