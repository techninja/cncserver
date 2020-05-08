/**
 * @file Composing canvas/PaperJS widget definition with bindings.
 */
/* globals cncserver, paper */
import { html, dispatch } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';
import initTools from './canvas-compose.tools.mjs';

/**
 * Hybrids property change factory for managing layer changes.
 *
 * @param {string} [defaultLayer='']
 *   Machine name of the layer to change to.
 *
 * @returns {Hybrids factory}
 */
function layerChangeFactory(defaultLayer = '') {
  return {
    set: (host, value) => {
      // If set externally (no through tabs), update the tabs.
      if (host.shadowRoot) {
        const tg = host.shadowRoot.querySelector('wl-tab-group');
        if (tg) {
          // Update the indicator AFTER this runs.
          setTimeout(() => { tg.updateIndicatorPosition(); }, 1);
        }
      }

      // If we have layers setup, update visibility.
      if (host.canvas && host.canvas.layers) {
        Object.entries(host.canvas.layers).forEach(([key, layer]) => {
          if (key !== 'overlay' && key !== 'underlay') {
            layer.visible = key === value;
          }
        });

        dispatch(host, 'layerchange', { detail: { layer: value } });
      }
      return value;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defaultLayer;
      }
    },
  };
}

/**
 * Paper canvas init event trigger.
 *
 * @param {Hybrids} host
 *   Host object to operate on.
 * @param {object} { detail }
 *   Detail object containing reference to the paper-canvas host object.
 */
function init(host, { detail }) {
  // Set the canvas from the paper canvas host object.
  host.canvas = detail.host;

  apiInit(() => {
    // Tell the paper canvas to watch for updates on these layers.
    host.canvas.scope.watchUpdates(['stage', 'preview']);

    // Get the bot size to apply to the canvas.
    cncserver.api.settings.bot().then(({ data: bot }) => {
      const stepsPerMM = {
        x: bot.maxArea.width / bot.maxAreaMM.width,
        y: bot.maxArea.height / bot.maxAreaMM.height,
      };

      const workspace = new paper.Rectangle({
        from: [
          bot.workArea.left / stepsPerMM.x,
          bot.workArea.top / stepsPerMM.y,
        ],
        to: [bot.maxAreaMM.width, bot.maxAreaMM.height],
      });

      // Initialize the paper-canvas with bot size details.
      host.canvas.scope.paperInit({
        size: new paper.Size(bot.maxAreaMM),
        layers: ['draw', 'stage', 'preview'],
        workspace,
      }).then(() => {
        // Bind the tools for the canvas.
        initTools(host);

        // Set the initial visible layer.
        host.layer = host.layer;
      });
    });
  });
}

// Bubble layer update events up from the canvas.
function bubbleUpdate(host, { detail: { layer } }) {
  dispatch(host, 'layerupdate', { detail: { layer } });
}

// Change visible layer based on tab input.
function tabChange(host, event) {
  const { name } = event.path[0];
  host.layer = name;
}

// Final component export.
export default styles => ({
  layer: layerChangeFactory('stage'),
  socketPayloads: {},
  canvas: {}, // Reference to initialized paper-canvas object.

  render: ({ layer }) => html`
    ${styles}
    <wl-tab-group onchange=${tabChange}>
      <wl-tab name="draw" checked=${layer === 'draw'}>Draw</wl-tab>
      <wl-tab name="stage" checked=${layer === 'stage'}>Stage</wl-tab>
      <wl-tab name="preview" checked=${layer === 'preview'}>Preview</wl-tab>
    </wl-tab-group>

    <paper-canvas
      name="compose"
      onpaperinit=${init}
      onlayerupdate=${bubbleUpdate}
    ></paper-canvas>
  `,
});
