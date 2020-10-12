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

/**
 * Initialize print specific canvas stuff, called from init() -> paperInit().
 *
 * @param {Hybrids} host
 *   Host object to operate on.
 */
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

/**
 * Bind socket to pen update positions, called from init()->apiInit().
 *
 * @param {Hybrids} host
 *   Host object to operate on.
 */
function bindSocketPosition(host) {
  cncserver.socket.on('pen update', ({ x, y, lastDuration: dur }) => {
    if (stepsPerMM) {
      host.position = { pos: stepsToPaper({ x, y }), dur };
    } else {
      tempPosition = { x, y };
    }
  });
}

/**
 * Position change factory for updates from socket.
 *
 * @param {object} [defaultPos={ pos: [0, 0], dur: 0 }]
 *   The new next position and duration for how long it should take to get there in ms.
 *
 * @returns
 *   Hybrids factory for managing host method state.
 */
function positionChangeFactory(defaultPos = { pos: [0, 0], dur: 0 }) {
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

/**
 * Paper canvas init event trigger.
 *
 * @param {Hybrids} host
 *   Host object to operate on.
 * @param {object} { detail }
 *   Detail object containing reference to the paper-canvas host object.
 */
function init(host, { detail }) {
  // Set the canvas
  host.canvas = detail.host;

  apiInit(() => {
    // Setup position socket updates.
    bindSocketPosition(host);

    // Tell the canvas to keep the print & tools layers updated.
    host.canvas.scope.watchUpdates(['print', 'tools']);

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
      host.canvas.scope
        .paperInit({
          size: new paper.Size(bot.maxAreaMM),
          layers: ['print', 'tools'],
          workspace,
        })
        .then(() => {
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
