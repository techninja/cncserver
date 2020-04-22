/**
 * @file Main draw render settings widget definition with bindings.
 */
/* globals document, paper, cncserver, JSONEditor, _ */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

let contentSchema = {}; // Globalize the content schema, to be filled on init.
let renderSettings = {}; // Settings & bounds JSONEditor objects once initialized.
let boundsSettings = {};

// Map of objects keyed by hash to store all content in project.
const contentItems = new Map();

let lastRenderSettings = null;
let lastBoundsSettings = null;

const globalJSONEditorSettings = {
  iconlib: 'fontawesome5',
  theme: 'bootstrap4',
  disable_properties: true,
  disable_edit_json: true,
  required_by_default: true,
  disable_array_add: true,
  disable_array_delete: true,
  no_additional_properties: true,
};

const dp = document.querySelector('draw-preview');

// Get only the parts that are different from a complete/deep settings object.
function settingsDiff(inObject, inBase) {
  const changes = (object, base) => (
    _.pick(
      _.mapObject(object, (value, key) => (
        (!_.isEqual(value, base[key])) ?
          ((_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value) :
          null
      )),
      value => (value !== null)
    )
  );

  let finalChanges = changes(inObject, inBase)

  // When changing a fill/vectorize method, we don't want anything else.
  if (finalChanges.fill) {
    if (finalChanges.fill.method) {
      finalChanges = { fill: { method: finalChanges.fill.method } };
    }
  }

  if (finalChanges.vectorize) {
    if (finalChanges.vectorize.method) {
      finalChanges = { vectorize: { method: finalChanges.vectorize.method } };
    }
  }
  return finalChanges;
}

// Event trigger on display preview layer update from socket.
function layerUpdate(host, layer) {
  if (layer === 'stage' && paper.project) {
    // Add all content items in current project, plus project info.
    cncserver.api.projects.current.stat().then(({ data: project }) => {
      contentItems.clear();
      contentItems.set('project', {
        title: 'Project',
        hash: 'project',
        bounds: {},
        settings: project.settings || {},
      });

      Object.entries(project.content).forEach(([hash, { title, bounds, settings }]) => {
        contentItems.set(hash, { hash, title, bounds, settings });
      });

      console.log('Item!', host.item);
      if (!host.item) host.item = 'project';
    });
  }
}

// Change selected item (content hash) on select change.
function contentSelectChange(host, event) {
  host.item = event.target.value;
}

// Callback for JSONEditor change callback.
function boundsChange(host) {
  if (!lastBoundsSettings) {
    lastBoundsSettings = boundsSettings.getValue();
  } else {
    const changed = boundsSettings.getValue();
    const diffObject = settingsDiff(changed, lastBoundsSettings);
    if (Object.keys(diffObject).length) {
      cncserver.api.content.item.update(host.item, { bounds: diffObject });
      lastBoundsSettings = boundsSettings.getValue();
    }
  }
}

// Callback for JSONEditor change callback.
function settingsChange(host) {
  if (!lastRenderSettings) {
    lastRenderSettings = renderSettings.getValue();
  } else {
    const changed = renderSettings.getValue();
    const diffObject = settingsDiff(changed, lastRenderSettings);
    if (Object.keys(diffObject).length) {
      if (host.item === 'project') {
        cncserver.api.projects.current.update({ settings: diffObject });
      } else {
        cncserver.api.content.item.update(host.item, { settings: diffObject });
      }
      lastRenderSettings = renderSettings.getValue();
    }
  }
}


// Fully initialize the element.
function init(host) {
  if (!host.initialized) {
    host.initialized = true;

    // Get the full content schema for making forms.
    apiInit(() => {
      cncserver.api.content.schema().then(({ data: schema }) => {
        contentSchema = schema;

        // With schema initialized, fill in the JSONEditor objects.
        const settingsData = {
          ...globalJSONEditorSettings,
          // object_layout: 'grid', // TODO: Get this setup.
          schema: contentSchema.properties.settings,
        };
        const settingsForm = host.shadowRoot.querySelector('form#settings');
        renderSettings = new JSONEditor(settingsForm, settingsData);
        renderSettings.on('change', () => settingsChange(host));

        // Same for bounds
        const boundsData = {
          ...globalJSONEditorSettings,
          object_layout: 'grid',
          schema: contentSchema.properties.bounds,
        };
        const boundsForm = host.shadowRoot.querySelector('form#bounds');
        boundsSettings = new JSONEditor(boundsForm, boundsData);
        boundsSettings.on('change', () => boundsChange(host));
      });
    });

    // Bind to display preview selection change to switch settings item.
    dp.addEventListener('selectionchange', ({ detail: { selection } }) => {
      host.item = selection || 'project';
    });

    // Bind to layer content update.
    dp.addEventListener(
      'layerupdate',
      ({ detail: { layer } }) => layerUpdate(host, layer)
    );
  }
}

// Item change factory, takes a hash and changes what's selected.
function itemChangeFactory(defaultItem = '') {
  return {
    set: (host, value) => {
      const item = contentItems.get(value);

      // Does the item exist?
      if (item) {
        console.log('Item exists! Set it.', value);

        // Reset and set values of form fields
        lastRenderSettings = null;
        lastBoundsSettings = null;
        renderSettings.setValue(item.settings);
        boundsSettings.setValue(item.bounds);
        return value;
      }

      console.log('No item found.', value);
      // Not found.
      return null;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defaultItem;
      }
    },
  };
}

export default styles => ({
  item: itemChangeFactory(''),
  initialized: false,

  render: ({ item }) => html`
    ${styles}
    <link href="/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    <select id="content-select" onchange=${contentSelectChange}>
      ${Array.from(contentItems).map(([hash, { title }]) => html`
        <option value=${hash} selected=${item === hash}>${title}</option>
      `)}
    </select>
    <div id="settings-forms">
      <form id="bounds" style=${{ display: item && item !== 'project' ? 'block' : 'none' }}></form>
      <form id="settings"></form>
    </div>
    ${init}
  `,
});
