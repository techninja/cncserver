/**
 * @file Draw preview/PaperJS widget definition with bindings.
 */
/* globals cncserver, paper, window, Event */
import initTools from './draw-preview.tools.mjs';

// The scale to adjust for pixel to MM offset.
const viewScale = 3;

const state = { pen: {}, lastPen: {} };
let currentPos = {};
let destinationPos = {};

export function initPaper(host, bot) {
  // Initialize paper on the shadowroot canvas with settings.
  paper.setup(host.shadowRoot.querySelector('#paper'));
  paper.settings.handleSize = 15;

  // Set the view scale and setup paper to be 1:1 mm with bot.
  paper.project.view.viewSize = [
    bot.maxAreaMM.width * viewScale,
    bot.maxAreaMM.height * viewScale,
  ];

  // TODO: why are these offsts needed?
  paper.project.view.center = [
    bot.maxAreaMM.width / viewScale + bot.maxAreaMM.width / 6,
    bot.maxAreaMM.height / viewScale + bot.maxAreaMM.height / 6,
  ];
  paper.project.view.scaling = [viewScale, viewScale];

  // Setup 4 layers: Drawing, moving, preview, and overlay.
  host.layers = {
    draw: new paper.Layer({ name: 'draw' }),
    stage: new paper.Layer({ name: 'stage' }),
    preview: new paper.Layer({ name: 'preview' }),
    overlay: new paper.Layer({ name: 'overlay' }),
  };

  // Set default from existing on init.
  host.layer = host.layer;

  // Import initial payloads if existing
  if (host.layerPayloads) {
    if (host.layerPayloads.stage) {
      host.layers.stage.importJSON(host.layerPayloads.stage);
    }

    if (host.layerPayloads.preview) {
      host.layers.preview.importJSON(host.layerPayloads.preview);
    }
  }

  // Let the canvas resize within its space.
  const canvas = host.shadowRoot.querySelector('#paper');
  const wrapper = host.shadowRoot.querySelector('#canvas-wrapper');
  window.addEventListener('resize', () => {
    host.scale = wrapper.offsetWidth / canvas.offsetWidth;
    canvas.style.transform = `scale(${host.scale})`;
    wrapper.style.height = `${canvas.offsetHeight * host.scale}px`;
  });

  // Trigger resize
  window.dispatchEvent(new Event('resize'));

  // Inititalize the layer specific tools.
  initTools(host);
}

export function initOverlay(host, bot) {
  // Setup the overlay.
  host.layers.overlay.activate();

  // Setup workarea (on active overlay layer)
  paper.Path.Rectangle({
    point: [
      bot.workArea.left / host.stepsPerMM.x,
      bot.workArea.top / host.stepsPerMM.y,
    ],
    size: [bot.maxAreaMM.width, bot.maxAreaMM.height],
    strokeWidth: 2,
    strokeColor: 'red',
  });

  // Make crosshair (on active overlay layer).
  const size = 15 / viewScale;
  currentPos = new paper.Group({
    children: [
      new paper.Shape.Circle([0, 0], size),
      new paper.Path.Line([-size * 1.5, 0], [-size / 5, 0]),
      new paper.Path.Line([size * 1.5, 0], [size / 5, 0]),
      new paper.Path.Line([0, -size * 1.5], [0, -size / 5]),
      new paper.Path.Line([0, size * 1.5], [0, size / 5]),
    ],
    strokeColor: 'black',
    strokeWidth: size / 5,
  });

  destinationPos = currentPos.clone();
  destinationPos.strokeColor = 'green';
  destinationPos.strokeWidth = size / 2;
  destinationPos.sendToBack();
}
