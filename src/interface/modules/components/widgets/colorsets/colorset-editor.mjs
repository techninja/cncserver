/**
 * @file Colorset editor slide group element definition.
 */
/* globals cncserver */

import apiInit from '/modules/utils/api-init.mjs';
import { html, dispatch } from '/modules/hybrids.js';
import { applyProps } from './pane-utils.mjs';

// Catch the first render of a host element, and dispatch refresh.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      dispatch(host, 'init');

      cncserver.api.colors.stat().then(({ data }) => {
        host.set = data.set;
        host.setTitle = data.set.title;
        host.setDescription = data.set.description;

        host.colors = [...data.set.items];
        host.implement = data.set.implement;

        host.colors.forEach((item) => {
          item.type = item.implement.type === 'inherit'
            ? data.set.implement.type : item.implement.type;
        });

      });
    }
  });
}

// TODO:
// - Implement paged editor interface
// - Colorset item viewer, with bot tool matched positions.
// - Colorset item editor for all fields except...
// - Implement editor from colorset level/item level
// - Implement preset loader for both internal and custom presets.

function switchPane(host, { detail: { destination, options } }) {
  // Actually switch to the detination slide.
  host.slide = destination;

  // Find the first child of the destination to set its data.
  const dest = host.shadowRoot.querySelector(`[name=${destination}] > *`);

  // Apply and destination props set in switch options.
  if (options.destProps) applyProps(dest, options.destProps);
}

export default styles => ({
  colors: [],
  implement: {},
  set: {},
  setTitle: '',
  setDescription: '',
  initialized: false,
  slide: 'colors',

  render: ({
    setTitle, setDescription, colors, slide, implement, set,
  }) => html`
    ${styles}

    <slide-group height="600" width="200" home="colors" activeItem=${slide}>
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
          name=${setTitle}
          description=${setDescription}
          set=${set}
          onswitchpane=${switchPane}
          colors=${colors}
          implement=${implement}
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
