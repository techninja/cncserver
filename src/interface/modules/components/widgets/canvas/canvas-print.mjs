/**
 * @file Draw preview/PaperJS widget definition with bindings.
 */
/* globals cncserver, paper */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';
import { onUpdate } from '/modules/utils/live-state.mjs';

const { Shape, Group, Path } = paper;

// Hold the crosshair position states.
const crosshairs = {
  current: {}, // Actual Bot Position Crosshair.
  destination: {}, // Eventual Bot Destination Crosshair.
};

const state = {
  stepsPerMM: null,
  temp: {
    current: null,
    destination: null,
  },
};

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
  return [x / state.stepsPerMM.x, y / state.stepsPerMM.y];
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
  crosshairs.current = new Group({
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

  // Make secondary destination crosshair.
  const dest = crosshairs.current.clone();
  dest.name = 'destinationPos';
  dest.strokeColor = 'green';
  dest.strokeWidth = size / 3;
  dest.sendToBack();
  crosshairs.destination = dest;

  // Set position if we have one saved from socket.
  if (state.temp.current) {
    host.current = {
      type: 'current',
      pos: stepsToPaper(state.temp.current),
      lastDuration: 0,
    };
  }
  if (state.temp.destination) {
    host.destination = {
      type: 'destination',
      pos: stepsToPaper(state.temp.destination),
      lastDuration: 0,
    };
  }
}

/**
 * Bind socket to pen update positions, called from init()->apiInit().
 *
 * @param {Hybrids} host
 *   Host object to operate on.
 */
function bindSocketPosition(host) {
  onUpdate('actualPen', ({ x, y, lastDuration }) => {
    if (state.stepsPerMM) {
      host.current = {
        type: 'current',
        pos: stepsToPaper({ x, y }),
        lastDuration,
      };
    } else {
      state.temp.current = { x, y };
    }
  });

  onUpdate('pen', ({ x, y, lastDuration }) => {
    if (state.stepsPerMM) {
      host.destination = {
        type: 'destination',
        pos: stepsToPaper({ x, y }),
        lastDuration,
      };
    } else {
      state.temp.destination = { x, y };
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
function positionChangeFactory(
  defaultPos = { type: 'current', pos: [0, 0], lastDuration: 0 }
) {
  return {
    set: (host, value) => {
      // Are we ready to set the value?
      if (state.stepsPerMM) {
        // If the duration is more than cutoff, animate it
        if (value.type === 'current') {
          if (value.lastDuration > 150) {
            crosshairs.current.tweenTo({ position: value.pos }, value.lastDuration);
          } else {
            crosshairs.current.position = value.pos;
          }
        } else {
          crosshairs.destination.position = value.pos;
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
      state.stepsPerMM = {
        x: bot.maxArea.width / bot.maxAreaMM.width,
        y: bot.maxArea.height / bot.maxAreaMM.height,
      };

      const workspace = new paper.Rectangle({
        from: [
          bot.workArea.left / state.stepsPerMM.x,
          bot.workArea.top / state.stepsPerMM.y,
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
  current: positionChangeFactory(),
  destination: positionChangeFactory(),
  canvas: {},

  render: () => html`
    ${styles}
    <paper-canvas name="print" onpaperinit=${init}></paper-canvas>
  `,
});
