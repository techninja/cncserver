/**
 * @file Colorset editor slide group element definition.
 */
/* globals cncserver */

import apiInit from '/modules/utils/api-init.mjs';
import { html, dispatch } from '/modules/hybrids.js';
import { applyProps } from './pane-utils.mjs';

function loadColors(host) {
  cncserver.api.colors.stat().then(({ data }) => {
    host.set = data.set;
    host.setTitle = data.set.title;
    host.setDescription = data.set.description;
    host.parentImplement = data.set.implement;
    host.items = [...data.set.items];
  });
}

// Catch the first render of a host element, and dispatch refresh.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      dispatch(host, 'init');
      loadColors(host);
    }
  });
}

/**
 * Individual sub-element host onSwitchPane event callback.
 *
 * @param {Hybrids} host
 *   This host element.
 * @param {Event} { detail: { destination, options } }
 *   DOM Event object including "event.target" of source element.
 */
function switchPane(host, { detail: { destination, options } }) {
  // Actually switch to the detination slide.
  host.slide = destination;

  // Find the first child of the destination to set its data.
  const dest = host.shadowRoot.querySelector(`[name=${destination}] > *`);

  // Reload colors?
  if (destination === 'colors' && options.reload) {
    loadColors(host);
  }

  console.log('Switch', options);
  // Apply and destination props set in switch options.
  if (options.destProps) applyProps(dest, options.destProps);
}

export default styles => ({
  set: {},
  parentImplement: '',
  items: [],
  setTitle: '',
  setDescription: '',
  initialized: false,
  slide: 'colors',

  render: ({
    setTitle, setDescription, items, slide, parentImplement, set,
  }) => html`
    ${styles}
    <style>
      :host {
        display: block;
        position: relative;
        overflow: hidden;
      }
    </style>

    <slide-group height="350" width="100" home="colors" activeItem=${slide}>
      <slide-item name="presets">
        <colorset-presets
          onswitchpane=${switchPane}
        ></colorset-presets>
      </slide-item>
      <slide-item name="edit-set">
        <colorset-edit-set
          onswitchpane=${switchPane}
        ></colorset-edit-set>
      </slide-item>
      <slide-item name="colors">
        <colorset-colors
          set=${set}
          name=${setTitle}
          description=${setDescription}
          items=${items}
          parentImplement=${parentImplement}
          onswitchpane=${switchPane}
        >
        </colorset-colors>
      </slide-item>
      <slide-item name="edit-color">
        <colorset-edit-color
          onswitchpane=${switchPane}
        ></colorset-edit-color>
      </slide-item>
      <slide-item name="edit-implement">
        <colorset-edit-implement
          onswitchpane=${switchPane}
        ></colorset-edit-implement>
      </slide-item>
    </slide-group>
    ${init}
  `,
});
