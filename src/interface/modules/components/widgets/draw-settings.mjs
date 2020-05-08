/**
 * @file Main draw render settings widget definition with bindings.
 */
/* globals document, paper, cncserver, JSONEditor, _ */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

// Globalize the content schema, to be filled on init.
let contentSchema = {};

// Settings & bounds JSONEditor objects once initialized.
let renderSettings = {};
let boundsSettings = {};

// Hold last settings adjustments to figure out diff changes.
let lastRenderSettings = null;
let lastBoundsSettings = null;

// Initial configuration object for JSONEditor.
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

// Select the canvas-compose DOM element so we can attach to its update events.
const canvasCompose = document.querySelector('canvas-compose');

/**
 * Retrieve an item with a matching hash from the content items array.
 *
 * @param {object} { contentItems }
 *   Host object containing the content items array.
 * @param {string} hash
 *   Hash to be found. Will correctly handle inappropriate input.
 *
 * @returns {object | undefined}
 *   Either the full object found with that hash, or undefined.
 */
function getItem({ contentItems }, hash) {
  return contentItems.filter(res => res.hash === hash)[0];
}

/**
 * Get only the parts that are different from a complete/deep settings object.
 *
 * @param {object} inObject
 *   Input object to check for diff against the base.
 * @param {object} inBase
 *   Base object to diff against the input.
 *
 * @returns {object}
 *   Only the differences between the two objects in full tree form.
 */
function settingsDiff(inObject, inBase) {
  const changes = (object, base) => (
    _.pick(
      _.mapObject(object, (value, key) => (
        // eslint-disable-next-line no-nested-ternary
        (!_.isEqual(value, base[key]))
          ? ((_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value)
          : null
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

/**
 * Event trigger on display preview layer update from socket.
 * Used to update the list of available content items.
 *
 * @param {hybrids} host
 *   Host object to operate on with.
 * @param {string} layer
 *   Which layer is being updated? We only care about stage here.
 */
function layerUpdate(host, layer) {
  if (layer === 'stage') {
    // Add all content items in current project, plus project info.
    cncserver.api.projects.current.stat().then(({ data: project }) => {
      const items = [];
      Object.entries(project.content).forEach(([hash, { title, bounds, settings }]) => {
        items.push({ hash, title, bounds, settings });
      });

      host.contentItems = [
        {
          title: 'Project',
          hash: 'project',
          bounds: {},
          settings: project.settings || {},
        },
        ...items,
      ];

      host.item = host.item || 'project';
    });
  }
}

/**
 * Change selected item (content hash) on select change.
 * Triggers itemFactoryChange.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 * @param {Event} event
 *   DOM Event for select change, used to get value.
 */
function contentSelectChange(host, event) {
  host.item = event.target.value;
}

/**
 * Callback for JSONEditor change on bounds settings.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 */
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

/**
 * Callback for JSONEditor change on draw settings.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 */
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

/**
 * Factory for managing host item change/value, takes hash, changes what's selected.
 *
 * @param {string} [defaultItem='']
 *   Hash value from hybrids factory handler.
 *
 * @returns {hybrids factory}
 */
function itemChangeFactory(defaultItem = '') {
  return {
    set: (host, value) => {
      const item = getItem(host, value);

      // Does the item exist?
      if (item) {
        // Reset and set values of form fields
        lastBoundsSettings = null;
        boundsSettings.setValue(item.bounds);

        // Only update render settings if there are differences.
        const diffSettings = settingsDiff(renderSettings.getValue(), lastRenderSettings);
        if (Object.entries(diffSettings).length || value !== host.item) {
          lastRenderSettings = null;
          renderSettings.setValue(item.settings);
        }

        return value;
      }

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

/**
 * Called on render, latch to fully initialize required variables.
 *
 * @param {hybrids} host
 *   Host object to operate on.
 */
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
    canvasCompose.addEventListener('selectionchange', ({ detail: { selection } }) => {
      console.log('Draw settings selection change', selection);
      host.item = selection || 'project';
    });

    // Bind to layer content update.
    canvasCompose.addEventListener(
      'layerupdate',
      ({ detail: { layer } }) => layerUpdate(host, layer)
    );
  }
}

// Export the full widget definition.
export default styles => ({
  item: itemChangeFactory(''),
  initialized: false,
  contentItems: [],

  render: ({ item, contentItems }) => html`
    ${styles}
    <link href="/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    <select id="content-select" onchange=${contentSelectChange}>
      ${contentItems.map(({ hash, title }) => html`
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
