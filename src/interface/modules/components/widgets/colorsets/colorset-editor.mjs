/**
 * @file Colorset editor slide group element definition.
 */
/* globals cncserver */

import apiInit from '/modules/utils/api-init.mjs';
import { html, dispatch } from '/modules/hybrids.js';


// Catch the first render of a host element, and dispatch refresh.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      dispatch(host, 'init');

      cncserver.api.colors.stat().then(({ data }) => {
        host.setTitle = data.set.title;
        host.setDescription = data.set.description;

        host.colors = [...data.set.items];

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
// - Slide Grid under window.
// - Colorset title/desc/default implement editor
// - Colorset item viewer, with bot tool matched positions.
// - Colorset item editor for all fields except...
// - Implement editor from colorset level/item level
// - Implement preset loader for both internal and custom presets.

function switchPane(host, { detail: { destination, options } }) {
  host.slide = destination;
  console.log('Switch to', destination, options);
}

export default styles => ({
  colors: [],
  setTitle: '',
  setDescription: '',
  initialized: false,
  slide: 'colors',

  render: ({ setTitle, setDescription, colors, slide }) => html`
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
          onswitchpane=${switchPane}
        >
          ${colors.map(({ id, name, color, type }) => html`
            <colorset-color-item
              id=${id}
              name=${name}
              color=${color}
              type=${type}
            >
            </colorset-color-item>
          `)}
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
