/**
 * @file Colorset Editor: preset loader element definition.
 */
/* globals cncserver */
import apiInit from '/modules/utils/api-init.mjs';
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';

function selectPreset(name) {
  return (host) => {
    cncserver.api.colors.preset(name).then(() => {
      handleSwitch('colors', { reload: true })(host);
      refreshData(host);
    });
  };
}

/**
 * Delete a given preset.
 *
 * @param {string} name
 *   Name of preset to delete. Will only work on valid custom presets.
 */
function deletePreset(name) {
  // TODO: confirm before deletion.
  return (host, event) => {
    event.stopPropagation();
    cncserver.api.colors.deletePreset(name).then(() => {
      refreshData(host);
    });
  };
}

function getRenderedPresets(host, { set, presets, customs, internals, invalidSets }) {
  const validColorsets = [];
  const invalidColorsets = [];
  Object.entries(presets).forEach(([presetName, preset]) => {
    const colors = [];
    const labels = [];
    const imps = [preset.implement];

    preset.items.forEach(({ color, name, implement }) => {
      colors.push(color);
      labels.push(name);
      if (implement !== '[inherit]') imps.push(implement);
    });

    const presetInvalid = presetName in invalidSets;
    const presetCustom = customs.includes(presetName);
    const presetOverridden = internals.includes(presetName) && presetCustom;
    const classes = { preset: true, invalid: presetInvalid, active: set.name === presetName };
    const desc = presetInvalid ? Object.values(invalidSets[presetName]).join(', ') : '';
    const build = html`
      <div class=${classes} onclick=${presetInvalid ? '' : selectPreset(presetName)} title=${desc}>
        ${presetCustom && html`
          <button-single
            icon=${presetOverridden ? 'history' : 'trash-alt'}
            desc=${presetOverridden ? 'Revert to factory default' : 'Delete Custom Colorset'}
            onclick=${deletePreset(presetName)}
          ></button-single>
        `}
        ${imps.map(implement => html`
          <tool-implement
            plain
            scale="3"
            preset=${implement}
          ></tool-implement>
        `)}
        <label-title>${preset.title}</label-title>
        <color-set
          colors=${colors.join(',')}
          labels=${labels.join(',')}
          width="150"
          display="line"
        ></color-set>
      </div>
    `;

    // Add to final output.
    if (presetInvalid) {
      invalidColorsets.push(build);
    } else {
      validColorsets.push(build)
    }
  });

  host.presets = [...validColorsets];
  host.invalidPresets = [...invalidColorsets];
}

function refreshData(host) {
  cncserver.api.colors.stat().then(({ data }) => {
    getRenderedPresets(host, data);
  });
}

// Catch the first render of a host element, and dispatch refresh.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;

      // Get all the presets.
      refreshData(host);
    }
  });
}

export default styles => ({
  initialized: false,
  presets: [],
  invalidPresets: [],

  render: ({ presets, invalidPresets }) => html`
    ${styles}
    <style>
      .presets {

      }

      .preset {
        border: 1px dashed red;
        border-radius: 2px;
        cursor: pointer;
        margin-bottom: 1em;
      }

      .preset.active {
        border-width: 2px;
      }

      .invalid-presets .preset {
        cursor: inherit;
        background-color: gray;
      }

    </style>
    <button-single
      text="Back"
      onclick=${handleSwitch('colors')}
    ></button-single>
    <label-title>Internal & Custom Presets</label-title>
    <div class="presets">
      ${presets.map(colorset => colorset)}
    </div>

    ${invalidPresets.length && html`
    <label-title>Invalid Presets</label-title>
    <div class="invalid-presets">
      ${invalidPresets.map(colorset => colorset)}
    </div>
    `}
    ${init}
  `,
});
