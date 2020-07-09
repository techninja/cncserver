/**
 * @file Basic tool widget definition with bindings.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

// Load and group all tools from the API.
function loadTools(host) {
  cncserver.api.tools.list().then(({ data: { tools: toolArray } }) => {
    if (toolArray.length) {
      const toolGroups = {};
      toolArray.forEach((tool) => {
        const group = tool.group || 'Default';

        if (!toolGroups[group]) toolGroups[group] = [];

        toolGroups[group].push(tool);
      });

      // Collect tool groups and tools into render array.
      Object.entries(toolGroups).forEach(([name, tools]) => {
        host.toolGroups = [...host.toolGroups, { name, tools }];
      });
    }
  });
}

// Actually switch to the tool.
function switchTool(toolName) {
  return () => {
    cncserver.api.tools.change(toolName);
  };
}

// Initialize the widget.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;

      // Bind tool change to pen updates.
      cncserver.socket.on('pen update', ({ tool }) => {
        host.currentTool = tool;
      });

      loadTools(host);
    }
  });
}

// Export the widget definition.
export default styles => ({
  initialized: false,
  currentTool: 'color0',
  toolGroups: [],
  render: ({ toolGroups, currentTool }) => html`
    ${styles}
    <label-title icon="toolbox">Tools:</label-title>
    <div class="field">
      ${toolGroups.map(
    ({ name, tools }) => html`
          <div>
            <h3>${name}</h3>
            <div class="tools">
              ${tools.map((tool) => {
      if (tool.id === currentTool) {
        return html`<wl-button>${tool.id}</wl-button>`;
      }
      return html`
                  <wl-button flat inverted outlined onclick="${switchTool(tool.id)}">
                    ${tool.id}
                  </wl-button
                  >
                `;
    })}
            </div>
          </div>
        `
  )}
    </div>
    ${init}
  `,
});
