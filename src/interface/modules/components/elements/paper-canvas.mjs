/**
 * @file Paper canvas element.
 */
/* globals paper, window, Event, cncserver */
import { html, dispatch } from '/modules/hybrids.js';

const { Layer, Path } = paper;
const tempContent = {};

/**
 * Draw a grid on the given layer within the given workspace.
 *
 * @param {Paper.Layer} layer
 *   Layer to add grid to.
 * @param {Paper.Rectangle} workspace
 *   Workspace to draw grid within.
 * @param {object} [rawOptions={}]
 *   Customizable grid options.
 */
function drawGrid(layer, workspace, rawOptions = {}) {
  const options = {
    gridArray: [10, 50],
    colors: ['blue', 'black'],
    sizes: [0.25, 0.5],
    opacity: 0.15,

    ...rawOptions,
  };

  layer.opacity = options.opacity;

  for (let i = 0; i < options.gridArray.length; i++) {
    for (let x = workspace.left; x < workspace.right; x += options.gridArray[i]) {
      layer.addChild(new Path({
        segments: [[x, workspace.top], [x, workspace.bottom]],
        strokeColor: options.colors[i],
        strokeWidth: options.sizes[i],
      }));
    }

    for (let y = workspace.top; y < workspace.bottom; y += options.gridArray[i]) {
      layer.addChild(new Path({
        segments: [[workspace.left, y], [workspace.right, y]],
        strokeColor: options.colors[i],
        strokeWidth: options.sizes[i],
      }));
    }
  }
}

/**
 * Implementor called function for initializing layers, base size, and resizing/scale.
 *
 * @param {Hybrids} host
 *   Host object, assumed as part of trigger init.
 * @param {object} options
 *   @param {Paper.Size} size
 *     Size object of final 1:1 dimensions of the canvas.
 *   @param {array} layers
 *     String array of accessible layer names.
 *   @param {Paper.Rectangle} workspace
 *     Effective workspace rectangle, will be drawn on overlay layer.
 *
 * @returns {Promise}
 *   Resolves when initialization is done.
 */
function paperInit(host, { size, layers = [], workspace }) {
  return new Promise((resolve) => {
    const canvas = host.shadowRoot.querySelector('canvas');

    // Initialize paper on the shadowroot canvas with settings.
    const { viewScale, scope } = host;
    scope.activate();

    // Set the view scale and setup paper to be 1:1 with size, scaled by viewScale.
    scope.project.view.viewSize = [size.width * viewScale, size.height * viewScale];

    // Track center position while scaling.
    scope.project.view.center = [
      size.width / viewScale + size.width / (viewScale * 2),
      size.height / viewScale + size.height / (viewScale * 2),
    ];
    scope.project.view.scaling = [viewScale, viewScale];

    // Setup all the layers.
    const finalLayers = {};
    ['underlay', ...layers, 'overlay'].forEach((name) => {
      finalLayers[name] = new Layer({ name });
    });

    // Set default from existing on init.
    host.layers = { ...finalLayers };
    host.workspace = workspace;

    // Let the canvas resize within its space.
    const wrapper = host.shadowRoot.querySelector('.wrapper');
    host.scale = wrapper.offsetWidth / canvas.offsetWidth;
    window.addEventListener('resize', () => {
      host.scale = wrapper.offsetWidth / canvas.offsetWidth;
      canvas.style.transform = `scale(${host.scale})`;
      wrapper.style.height = `${canvas.offsetHeight * host.scale}px`;
    });

    // Trigger resize
    window.dispatchEvent(new Event('resize'));

    // Add initial content if there is any.
    Object.entries(tempContent).forEach(([layer, json]) => {
      if (host.layers[layer]) host.layers[layer].importJSON(json);
    });

    host.layers.overlay.activate();

    // Add workspace overlay.
    if (!host.workspaceOnly) {
      Path.Rectangle({
        point: workspace.point,
        size: workspace.size,
        strokeWidth: 2,
        strokeColor: 'red',
        name: 'workspace',
      });
    } else {
      // Resize the canvas to just the workspace.
      scope.project.view.translate([-workspace.point.x, -workspace.point.y]);
      scope.project.view.viewSize = [
        (size.width - workspace.point.x) * viewScale,
        (size.height - workspace.point.y) * viewScale,
      ];
    }

    // Draw underlay grid.
    drawGrid(host.layers.underlay, workspace);

    // Let the implementor know we're done.
    resolve();
  });
}

/**
 * Initialize the element.
 *
 * @param {Hybrids} host
 */
function init(host) {
  if (!host.initialized) {
    host.initialized = true;
    const canvas = host.shadowRoot.querySelector('canvas');

    host.scope = new paper.PaperScope();
    host.scope.setup(canvas);
    host.scope.settings.handleSize = 15;

    // Add function for initializing and catching updates to content.
    host.scope.watchUpdates = (layers) => {
      cncserver.socket.on('paper layer', ({ layer, paperJSON }) => {
        if (layers.includes(layer)) {
          if (host.layers && host.layers[layer]) {
            // TODO: Move to piecemeal format for these updates.
            host.layers[layer].removeChildren();
            host.layers[layer].importJSON(paperJSON);
          } else {
            tempContent[layer] = paperJSON;
          }

          // Dispatch a named update.
          dispatch(host, 'layerupdate', { detail: { layer } });
        }
      });
    };

    host.scope.paperInit = options => paperInit(host, options);

    // Dispatch the paperinit event, expecting the implementor to send
    // the rest of the info needed there.
    dispatch(host, 'paperinit', { detail: { host } });
  }
}

// Final component export.
export default () => ({
  initialized: false,
  viewScale: 3, // Scale to add to the given size, sets raster volume.
  workspace: {}, // Workspace area rectangle.
  workspaceOnly: false, // If true, visible area is limited to workspace.
  scope: {}, // Final initialized PaperScope object.
  layers: {}, // Keyed object of all Paper.Layer objects.
  scale: 1, // How much to scale points, set by resizing algo.
  name: '',

  render: () => html`
    <style>
      canvas {
        transform-origin: top left;
        border: 1px solid black;
        display: block;
      }
    </style>

    <div class="wrapper"><canvas></canvas></div>
    ${init}
  `,
});
