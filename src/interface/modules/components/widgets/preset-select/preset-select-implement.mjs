/**
 * @file Preset Selector: Show all presets for implements, allow selection.
 */
/* globals cncserver */
import { html, dispatch } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

function refreshPresets(host) {
  cncserver.api.implements.stat().then(({ data }) => {
    host.presets = [...Object.values(data.presets)];
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
  allowInherit: false,
  selected: '',
  color: '#000000',
  presets: [],
  parentPreset: '',

  render: ({ selected, presets, allowInherit, parentPreset, color }) => html`
    ${styles}
    <style>
      .wrapper {
        overflow-y: auto;
        height: 200px;
      }

      .wrapper > div {
        display: grid;
        cursor: pointer;
        width: 100%;
        grid-template-columns: 2fr 5fr;
      }

      .wrapper .active {
        border: 2px solid red;
      }

      .wrapper .inherit {
        background-color: cornflowerblue;
      }
    </style>

    <div class="selected">
      <tool-implement
          preset=${selected === '[inherit]' ? parentPreset : selected}
          color=${color}
        ></tool-implement>
    </div>
    <div class="wrapper">
    ${allowInherit && html`
      <div class=${{ active: selected === '[inherit]', inherit: 1 }}
          onclick=${selectItem('[inherit]')}>
          ${parentPreset && html`
          <tool-implement
            scale=2
            preset=${parentPreset}
            color=${color}
            plain
          ></tool-implement>
          `}
          <h2>[Parent Implement]</h2>
      </div>
    `}
    ${presets.map((preset) => html`
      <div class=${{ active: preset.name === selected }}
          onclick=${selectItem(preset.name)}>
        <tool-implement
          scale=2
          preset=${preset.name}
          color=${color}
          plain
        ></tool-implement>
        <div><h4>${preset.manufacturer}</h4><small>${preset.title}</small></div>
      </div>
    `)}
    </div>
    ${init}
  `,
});
