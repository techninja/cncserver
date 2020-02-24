/**
 * @file Tab panel definition with bindings for Colors.
 */
/* globals cncserver, window */
import { html } from '/modules/hybrids.js';

function addItem(host, { id: name, name: title, color }) {
  host.items = [
    ...host.items,
    { name, title, color },
  ];
}

function refresh(host) {
  cncserver.api.colors.stat().then(({ data: { set } }) => {
    host.items = [];
    set.forEach((item) => {
      addItem(host, item);
    });
  });
}

function getPresets(host) {
  cncserver.api.colors.stat().then(({ data: { presets } }) => {
    const options = [];
    Object.entries(presets).forEach(([name, preset]) => {
      const text = `${preset.manufacturerName} ${preset.name} ${preset.mediaName}`;
      const icon = preset.media === 'pen' ? 'pen' : 'paint-brush';
      const colors = [];

      // Move through all colors in all presets and add as suggestions.
      Object.entries(preset.colors).forEach(([id, { color, name: title }]) => {
        colors.push({ title, color });
      });

      options.push({
        name, text, colors, icon,
      });
    });

    host.presets = [...options];
  });
}

function loadPreset(name, text) {
  return (host) => {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Replace current colorset with "${text}"?`)) {
      cncserver.api.colors.preset(name).then(() => { refresh(host); });
    }
  };
}

// Run only on initialization of the colorset editor, load remote info.
function initPanel(host) {
  refresh(host);
  getPresets(host);
}

function removeItem(host, { detail: { name } }) {
  cncserver.api.colors.delete(name).then(() => {
    refresh(host);
  });
}

function saveItem(host, { detail: { name: id, title: name, color } }) {
  cncserver.api.colors.save({ id, color, name }).then(() => { refresh(host); });
}

function createItem(host, { detail: { name: id, title: name, color } }) {
  cncserver.api.colors.add({ id, color, name }).then(() => { refresh(host); });
}

export default styles => ({
  items: [],
  presets: [],
  render: ({ items, presets }) => html`
    ${styles}

    <colorset-editor
      onsave="${saveItem}"
      oncreate="${createItem}"
      onremove="${removeItem}"
      oninit="${initPanel}"
    >
      ${items.map(({ name, title, color }) => html`
        <colorset-item name="${name}" title="${title}" color="${color}"></colorset-item>
      `)}
    </colorset-editor>

    <div class="field" id="color-presets">
      <label-title icon="puzzle-piece">Presets:</label-title>
      <div class="field">
        ${presets.map(({
    name, text, colors, icon,
  }) => html`
        <div title="Load this preset" class="preset" onclick="${loadPreset(name, text)}">
          <header class="card-header">
            <i class="fas fa-lg fa-${icon}"></i>
            ${text}
            <span class="colors">
              ${colors.map(({ title, color }) => html`
                <b style="${{ backgroundColor: color }}" title="${title}"></b>
              `)}
            </span>
          </header>
        </div>
        `)}
      </div>
    </div>
  `,
});
