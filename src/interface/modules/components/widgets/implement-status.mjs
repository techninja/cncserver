/**
 * @file Implement/pen status widget and modal change notifier.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';
import {
  colorset, actualPen, onUpdate, applyObjectTo
} from '/modules/utils/live-state.mjs';

let lastImplement = '';
let lastImplementName = '';
let lastColorID = '';
let lastColorName = '';

function setImplementName(host, implement, key) {
  if (!implement) {
    host[key] = "No Implement";
  } else {
    if (lastImplement !== implement) {
      lastImplement = implement;
      cncserver.api.implements.get(implement).then(({ data: { manufacturer, title } }) => {
        console.log('Set implement', implement, key, title);
        host[key] = `${manufacturer} ${title}`;
        lastImplementName = host[key];
      });
    } else {
      host[key] = lastImplementName;
    }
  }
}

function setColorName(host, id, key) {
  if (!id) {
    host[key] = "No Color";
  } else {
    if (lastColorID !== id) {
      lastColorID = id;
      cncserver.api.colors.get(id).then(({ data: { name } }) => {
        console.log('Set color', key, name);
        host[key] = name;
        lastColorName = name;
      });
    } else {
      host[key] = lastColorName;
    }
  }
}

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;

      // Bind to actual pen updates.
      onUpdate('actualPen', () => {
        // Set values for all keys that exist in host.
        applyObjectTo(actualPen, host, true);

        if (!host.implement) {

          setImplementName(host, actualPen.implement, 'implementName');
          setColorName(host, actualPen.colorsetItem, 'colorName');
        }
      });

      // Catch when it's time to manually swap pen over.
      cncserver.socket.on('manualswap trigger', ({ index }) => {
        cncserver.api.colors
          .get(index)
          .then(({ data: item }) => {
            host.modalActive = true;
            host.newImplement = item.implement;
            console.log('Setting new Implement', item.implement);
            setImplementName(host, item.implement, 'newImplementName');
            host.newColor = item.color;
            host.newColorName = item.name;
          });
      });
    }
  });
}

function implementReady(host) {
  hideModal(host);

  // Apply new state to current.
  host.implement = host.newImplement;
  host.implementName = host.newImplementName;
  host.color = host.newColor;
  host.colorName = host.newColorName;
  cncserver.api.tools.change('manualresume');
}

function showModal(host) {
  host.modalActive = true;
}

function hideModal(host) {
  host.modalActive = false;
}

// Actual new todo:
// - Need an endpoint with data on what future implement is going to be (current at now?)
// - Need to get color on reload
// - Need to show modal on reload when in waiting mode

// TODO: What is this?
// - Show Current Color, current implement (image)
// - Show current Z/height vs all heights
// - Add buttons from toolbar top
// - X/Y coordinates in MM (with crosshairs and arrows showing layout)
export default styles => ({
  // Mapped directly from pen state.
  x: 0,
  y: 0,
  z: 0,
  tool: 'color0',
  colorsetItem: '',
  implement: '',
  distanceCounter: 0,

  // State.
  implementName: '',
  color: '#000000',
  colorName: '',
  initialized: false,
  modalActive: false,
  newColor: '#0000FF',
  newColorName: '',
  newImplement: '',
  newImplementName: '',

  render: ({
    x,
    y,
    z,
    implement,
    implementName,
    newImplement,
    newImplementName,
    modalActive,
    color,
    colorName,
    newColor,
    newColorName,
    distanceCounter,
  }) => html`
    ${styles}
    <style>
      :host {
        display: block;
        border: 2px solid white;
        background-color: #dddddd;
        padding: 0.5em;
        height: 120px;
        width: 200px;
        border-radius: 0 0 0 1.5em;
      }

      div.implements {
        text-align: center;
        color: black;
      }

      div.implements .items {
        margin-top: 1em;
        display: grid;
        grid-template-columns: 3fr 1fr 3fr;
        grid-gap: 1em;
        align-items: center;
      }

      div.implements .icon {
        font-size: 2em;
      }

      div.modal-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-gap: 1em;
        width: 100%;
      }

      div.widget {
        cursor: pointer;
        display: grid;
        grid-template-columns: 1fr 2fr;
        grid-gap: 0.5em;
      }

      div.widget .details {
        color: black;
      }
    </style>
    <notify-modal
      header="Time to change the implement:"
      type="success"
      icon="exchange-alt"
      onclose=${hideModal}
      active=${modalActive}
    >
      <div class="implements" slot="message">
        <p>Please remove ${implementName} (${colorName}) and replace with ${newImplementName} (${newColorName}).</p>
        <div class="items">
          <tool-implement
            preset=${implement}
            color=${color}
            scale="5"
            plain
          ></tool-implement>
          <span class="icon">
            <i class="fas fa-angle-double-right" aria-hidden="true"></i>
          </span>
          <tool-implement
            preset=${newImplement}
            color=${newColor}
            scale="5"
            plain
          ></tool-implement>
        </div>
      </div>
      <div class="modal-buttons" slot="buttons">
        <button-single
          icon="clock"
          onclick=${hideModal}
          text="I'm not ready yet."
          type="danger"
          fullwidth
        ></button-single>
        <button-single
          icon="check"
          onclick=${implementReady}
          text=${`Continue Drawing with ${newColorName}`}
          type="success"
          fullwidth
        ></button-single>
      </div>
    </notify-modal>
    <label-title icon="info-circle">Status:</label-title>
    <div class="widget" onclick="${showModal}">
      <tool-implement
        class="current"
        preset=${implement}
        color=${color}
        scale="2.5"
        plain
      ></tool-implement>
      <div class="details">
        <ul>
          <li>X: ${x}</li>
          <li>Y: ${y}</li>
          <li>Z: ${z}</li>
          <li>D: ${distanceCounter}</li>
        </ul>
      </div>
    </div>

    ${init}
  `,
});
