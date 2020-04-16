/**
 * @file Index of all source components.
 */

module.exports = {
  utils: './components/core/utils/cncserver.utils',
  binder: './components/core/utils/cncserver.binder',
  settings: './components/core/utils/cncserver.settings',
  i18n: './components/core/utils/cncserver.i18n',
  server: './components/core/comms/cncserver.server',
  rest: './components/core/comms/cncserver.rest',
  api: './components/core/comms/cncserver.api',
  ipc: './components/core/comms/cncserver.ipc',
  serial: './components/core/comms/cncserver.serial',
  sockets: './components/core/comms/cncserver.sockets',
  pen: './components/core/control/cncserver.pen',
  actualPen: './components/core/control/cncserver.actualpen',
  control: './components/core/control/cncserver.control',
  buffer: './components/core/utils/cncserver.buffer',
  run: './components/core/utils/cncserver.run',
  scratch: './components/third_party/scratch/cncserver.scratch',
  bots: './components/machine_support/',
  drawing: './components/core/drawing',
  projects: './components/core/control/cncserver.projects',
  content: './components/core/control/cncserver.content',
  schemas: './components/core/schemas/cncserver.schemas',
};
