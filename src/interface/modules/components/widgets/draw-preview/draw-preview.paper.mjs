/**
 * @file Draw preview/PaperJS widget definition with bindings.
 */
/* globals paper, window, Event */
import { dispatch } from '/modules/hybrids.js';
import initTools from './draw-preview.tools.mjs';

const { Path, Layer, Rectangle } = paper;

// The scale to adjust for pixel to MM offset.
const viewScale = 3;

const state = { pen: {}, lastPen: {} };
let currentPos = {};
let destinationPos = {};

// Create a display grid on the passed layer (underlay).
function initGrid(layer, workArea, rawOptions = {}) {
  const options = {
    gridArray: [10, 50],
    colors: ['blue', 'black'],
    sizes: [0.25, 0.5],
    opacity: 0.15,

    ...rawOptions,
  };

  layer.opacity = options.opacity;

  for (let i = 0; i < options.gridArray.length; i++) {
    for (let x = workArea.left; x < workArea.right; x += options.gridArray[i]) {
      layer.addChild(new Path({
        segments: [[x, workArea.top], [x, workArea.bottom]],
        strokeColor: options.colors[i],
        strokeWidth: options.sizes[i],
      }));
    }

    for (let y = workArea.top; y < workArea.bottom; y += options.gridArray[i]) {
      layer.addChild(new Path({
        segments: [[workArea.left, y], [workArea.right, y]],
        strokeColor: options.colors[i],
        strokeWidth: options.sizes[i],
      }));
    }
  }
}

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

  // Setup all the layers.
  host.layers = {
    // Base, beneath all others, non interactive.
    underlay: new Layer({ name: 'underlay' }),

    // All interactive/visible layers.
    draw: new Layer({ name: 'draw' }),
    stage: new Layer({ name: 'stage' }),
    preview: new Layer({ name: 'preview' }),

    // Overlay, on top of everything, non interactive.
    overlay: new Layer({ name: 'overlay' }),
  };

  // Set default from existing on init.
  host.layer = host.layer;

  // Import initial payloads if existing
  if (host.socketPayloads) {
    if (host.socketPayloads.stage) {
      host.layers.stage.importJSON(host.socketPayloads.stage);
      dispatch(host, 'layerupdate', { detail: { layer: 'stage' } });
    }

    if (host.socketPayloads.preview) {
      host.layers.preview.importJSON(host.socketPayloads.preview);
      dispatch(host, 'layerupdate', { detail: { layer: 'preview' } });
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
  host.workArea = new Rectangle({
    from: [
      bot.workArea.left / host.stepsPerMM.x,
      bot.workArea.top / host.stepsPerMM.y,
    ],
    to: [bot.maxAreaMM.width, bot.maxAreaMM.height],
  });

  // Setup the background grid.
  initGrid(host.layers.underlay, host.workArea);

  // Setup red work area signifier.
  Path.Rectangle({
    point: host.workArea.point,
    size: host.workArea.size,
    strokeWidth: 2,
    strokeColor: 'red',
    name: 'workArea',
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
    name: 'currentPos',
  });

  destinationPos = currentPos.clone();
  destinationPos.name = 'destinationPos';
  destinationPos.strokeColor = 'green';
  destinationPos.strokeWidth = size / 2;
  destinationPos.sendToBack();

  // Set position if we have one saved from socket.
  if (host.socketPayloads.position) {
    const { x, y } = host.socketPayloads.position;
    host.position = {
      pos: [x / host.stepsPerMM.x, y / host.stepsPerMM.y],
      dur: 0,
    };
  }
}

// What happens when the layer is changed from the tabs?
export function layerChangeFactory(defaultLayer = '') {
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
      if (host.layers) {
        Object.entries(host.layers).forEach(([key, layer]) => {
          if (key !== 'overlay' && key !== 'underlay') {
            layer.visible = key === value;
          }
        });

        dispatch(host, 'layerchange');
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

// What happens when position changes from sockets?
export function positionChangeFactory(defaultPos = { pos: [0, 0], dur: 0 }) {
  return {
    set: (host, value) => {
      if (host.layers) {
        // If the duration is more than cutoff, animate it
        if (value.dur > 150) {
          currentPos.tweenTo({ position: value.pos }, value.dur);
        } else {
          // Set position directly
          currentPos.position = value.pos;
        }
      }
      return value;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defaultPos;
      }
    },
  };
}
