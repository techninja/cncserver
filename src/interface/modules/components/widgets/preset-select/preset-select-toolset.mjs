/**
 * @file Preset Selector: Show all presets for toolsets, allow selection.
 */
/* globals cncserver */
import { html, dispatch } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

function refreshPresets(host) {
  cncserver.api.tools.list().then(({ data }) => {
    const presets = Object.values(data.presets);

    presets.forEach(preset => {
      if (preset.name in data.invalidSets) {
        preset.invalid = Object.values(data.invalidSets[preset.name]).join(', ');
      }
    });

    host.presets = [...presets];

  });
}

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      refreshPresets(host);
    }
  });
}

function selectItem(name) {
  return (host) => {
    host.selected = name;
    dispatch(host, 'change');
  };
}

export default (styles) => ({
  initialized: false,
  selected: '',
  presets: [],

  render: ({ selected, presets }) => html`
    ${styles}
    <style>
      .wrapper {
        overflow-y: auto;
        height: 200px;
      }

      .wrapper div {
        border-bottom: 1px solid black;
        margin-bottom: 1em;
        cursor: pointer;
      }

      .wrapper div.invalid {
        cursor: inherit;
        background-color: gray;
      }

      .wrapper div.active {
        border: 2px solid red;
      }
    </style>

    <div class="wrapper">
    ${presets.map((preset) => html`
      <div class=${{ active: preset.name === selected, invalid: preset.invalid }}
          onclick=${!preset.invalid ? selectItem(preset.name) : ''}
          title=${preset.invalid ? preset.invalid : ''}>
        <h4>${preset.manufacturer}</h4>
        <strong>${preset.title}</strong>
        <p>${preset.description}</p>
      </div>
    `)}
    </div>
    ${init}
  `,
});
