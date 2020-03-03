/**
 * @file Draw preview/PaperJS widget definition with bindings.
 */
/* globals cncserver */
import { html, dispatch } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';
import initSocket from './draw-preview.socket.mjs';
import { initPaper, initOverlay, layerChangeFactory } from './draw-preview.paper.mjs';

function initState(host, bot) {
  host.stepsPerMM = {
    x: bot.maxArea.width / bot.maxAreaMM.width,
    y: bot.maxArea.height / bot.maxAreaMM.height,
  };
}

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      initSocket(host);
      cncserver.api.settings.bot().then(({ data: bot }) => {
        initState(host, bot);
        initPaper(host, bot);
        initOverlay(host, bot);
      });
    }
  });
}

function tabChange(host, event) {
  const { name } = event.path[0];
  host.layer = name;
  dispatch(host, 'layerchange');
}

export default styles => ({
  initialized: false,
  layer: layerChangeFactory('stage'),
  layerPayloads: {},
  scale: 1,
  workArea: {},
  paper: null,
  orientation: '0',
  layers: {},
  stepsPerMM: { x: 1, y: 1 },

  render: ({ layer }) => html`
    ${styles} ${init}
    <wl-tab-group onchange=${tabChange}>
      <wl-tab name="draw" checked=${layer === 'draw'}>Draw</wl-tab>
      <wl-tab name="stage" checked=${layer === 'stage'}>Stage</wl-tab>
      <wl-tab name="preview" checked=${layer === 'preview'}>Preview</wl-tab>
    </wl-tab-group>

    <div id="canvas-wrapper">
      <canvas class="simcanvas" id="paper"></canvas>
    </div>
  `,
});
