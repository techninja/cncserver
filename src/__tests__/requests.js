const { expect } = require('chai');

module.exports = {
  watercolorbot: {
    '/v1/settings': [
      {
        description: 'Settings: Set bot area',
        request: {
          url: '/v1/settings/bot',
          method: 'PUT',
          data: {
            maxArea: {
              width: 12000,
              height: 12000,
            },
          },
        },
        response: {
          data: {
            maxArea: {
              width: 12000,
              height: 12000,
            },
          },
        },
      },
    ],
    '/v1/buffer': [
      {
        description: 'Buffer: Pause',
        request: {
          url: '/v1/buffer',
          method: 'PUT',
          data: {
            paused: true,
          },
        },
        response: {
          data: {
            running: {},
            paused: true,
            count: 0,
          },
        },
      },
      {
        description: 'Buffer: Add',
        request: {
          url: '/v1/buffer',
          method: 'POST',
          data: {
            message: 'SM 10,100,100',
          },
        },
        response: {
          data: {
            status: 'Message added to buffer',
          },
        },
      },
      {
        description: 'Buffer: Resume',
        request: {
          url: '/v1/buffer',
          method: 'PUT',
          data: {
            paused: false,
          },
        },
        response: {
          data: {
            running: {},
            paused: false,
            count: 1,
          },
        },
      },
    ],
    '/v1/pen': [
      {
        description: 'Pen: Get state',
        request: {
          url: '/v1/pen',
          method: 'GET',
        },
        response: {
          data: {
            x: 0,
            y: 0,
            state: 'up',
            height: 19750,
            power: 0,
            busy: false,
            tool: 'water0dip',
            offCanvas: false,
            lastDuration: 1,
            distanceCounter: 0,
            simulation: 1,
          },
        },
      },
      {
        description: 'Pen: Set state 1.0',
        request: {
          url: '/v1/pen',
          method: 'PUT',
          data: {
            state: 1,
          },
        },
        response: {
          data: {
            state: 1,
            height: 12750,
          },
        },
      },
      {
        description: 'Pen: Set state 0.5',
        request: {
          url: '/v1/pen',
          method: 'PUT',
          data: {
            state: 0.5,
          },
        },
        response: {
          data: {
            state: 0.5,
            height: 16250,
          },
        },
      },
      {
        description: 'Pen: Set state 0.0',
        request: {
          url: '/v1/pen',
          method: 'PUT',
          data: {
            state: 0,
          },
        },
        response: {
          data: {
            state: 0,
            height: 19750,
          },
        },
      },
      {
        description: 'Pen: Travel 100, 100',
        request: {
          url: '/v1/pen',
          method: 'PUT',
          data: {
            x: 100,
            y: 100,
          },
        },
        response: {
          data: {
            x: 6315,
            y: 3600,
          },
        },
      },
      {
        description: 'Pen: Park',
        request: {
          url: '/v1/pen',
          method: 'DELETE',
        },
        response: {
          data: {
            x: 0,
            y: 0,
          },
        },
      },
    ],
    '/v1/motors': [
      {
        description: 'Motors: Disable',
        request: {
          url: '/v1/motors',
          method: 'DELETE',
        },
        response: {
          data: {
            status: 'Disable Queued',
          },
        },
      },
      {
        description: 'Motors: Reset offset',
        request: {
          url: '/v1/motors',
          method: 'PUT',
          data: {
            reset: 1,
          },
        },
        response: {
          data: {
            status: 'Motor offset reset to park position queued',
          },
        },
      },
    ],
    '/v1/tools': [
      {
        description: 'Tools: Get tools',
        request: {
          url: '/v1/tools',
          method: 'GET',
        },
        response: {
          data: {
            tools: [
              'water0',
              'water0dip',
              'water1',
              'water1dip',
              'water2',
              'water2dip',
              'color0',
              'color1',
              'color2',
              'color3',
              'color4',
              'color5',
              'color6',
              'color7',
              'color0dip',
              'color1dip',
              'color2dip',
              'color3dip',
              'color4dip',
              'color5dip',
              'color6dip',
              'color7dip',
              'manualswap',
              'manualresume',
            ],
          },
        },
        assertion: (a, b, message) => {
          expect(a.tools).to.include.members(b.tools, message);
        },
      },
      {
        description: 'Tools: Change tools',
        request: {
          url: '/v1/tools/water0dip',
          method: 'PUT',
        },
        response: {
          data: {
            status: 'Tool changed to water0dip',
          },
        },
      },
    ],
  },
};
