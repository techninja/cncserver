/**
 * @file Draw preview/PaperJS widget definition with bindings.
 */
/* globals cncserver, paper */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

const { Shape, Group, Path } = paper;

// Hold the position states.
let currentPos = {};
let destinationPos = {};
let stepsPerMM = null;
let tempPosition = null;

// TODO: Does this go here? Probably not.
/*
function getColorName(index) {
  return document.querySelector('panel-colors').items.filter(({ name }) => name === index)[0].title;
}

// Catch when it's time to manually swap pen over.
cncserver.socket.on('manualswap trigger', ({ index }) => {
  const message = `We are now ready to draw with ${getColorName(index)}. When it's in and ready, click ok.`;

  // eslint-disable-next-line no-alert
  if (window.confirm(message)) {
    cncserver.api.tools.change('manualresume');
  }
});

*/

/**
 * Util function to get x/y steps converted to MM.
 *
 * @param {object} { x, y }
 *   Coordinate in steps (from API).
 *
 * @returns {array}
 *   [X,Y] array of coordinate in mm.
 */
function stepsToPaper({ x, y }) {
  return [x / stepsPerMM.x, y / stepsPerMM.y];
}

// Initialize print specific canvas stuff.
function initPrint(host) {
  host.canvas.scope.activate();
  host.canvas.layers.overlay.activate();

  // Make crosshair (on active overlay layer).
  const size = 15 / host.canvas.viewScale;
  currentPos = new Group({
    children: [
      new Shape.Circle([0, 0], size),
      new Path.Line([-size * 1.5, 0], [-size / 5, 0]),
      new Path.Line([size * 1.5, 0], [size / 5, 0]),
      new Path.Line([0, -size * 1.5], [0, -size / 5]),
      new Path.Line([0, size * 1.5], [0, size / 5]),
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
  if (tempPosition) {
    host.position = { pos: stepsToPaper(tempPosition), dur: 0 };
  }
}

// Bind socket to pen update positions.
function bindSocketPosition(host) {
  cncserver.socket.on('pen update', ({ x, y, lastDuration: dur }) => {
    if (stepsPerMM) {
      host.position = { pos: stepsToPaper({ x, y }), dur };
    } else {
      tempPosition = { x, y };
    }
  });
}

// What happens when position changes from sockets?
export function positionChangeFactory(defaultPos = { pos: [0, 0], dur: 0 }) {
  return {
    set: (host, value) => {
      // Are we ready to set the value?
      if (stepsPerMM) {
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

function init(host, { detail }) {
  // Set the canvas
  host.canvas = detail.host;

  apiInit(() => {
    // Setup position socket updates.
    bindSocketPosition(host);

    // Tell the canvas to keep the preview layer updated.
    host.canvas.scope.watchUpdates(['preview']);

    // Get the bot size details and initialize the canvas with it.
    cncserver.api.settings.bot().then(({ data: bot }) => {
      stepsPerMM = {
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
        layers: ['preview'],
        workspace,
      }).then(() => {
        initPrint(host);
      });
    });
  });
}

export default styles => ({
  position: positionChangeFactory(),
  canvas: {},

  render: () => html`
    ${styles}
    <paper-canvas name="print" onpaperinit=${init}></paper-canvas>
  `,
});