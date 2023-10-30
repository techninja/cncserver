/**
 * @file Main draw render settings widget definition with bindings.
 */
/* globals document, cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

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
 * Callback for schema form change on bounds settings.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 * @param {Event} event
 *   Event containing diffObject.
 */
function boundsChange(host, { detail: { diffObject } }) {
  if (Object.keys(diffObject).length) {
    cncserver.api.content.item.update(host.item, { bounds: diffObject });
  }
}

/**
 * Callback for schema form change on draw settings.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 * @param {Event} event
 *   Event containing diffObject.
 */
function settingsChange(host, { detail: { diffObject } }) {
  if (Object.keys(diffObject).length) {
    if (host.item === 'project') {
      cncserver.api.projects.current.update({ settings: diffObject });
    } else {
      cncserver.api.content.item.update(host.item, { settings: diffObject });
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
        host.boundsForm.data = item.bounds;
        host.settingsForm.data = item.settings;

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

    // Get the schema forms attached to the host.
    apiInit(() => {
      host.boundsForm = host.shadowRoot.querySelector('schema-form#bounds');
      host.settingsForm = host.shadowRoot.querySelector('schema-form#settings');
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
  boundsForm: {},
  settingsForm: {},
  initialized: false,
  contentItems: [],

  render: ({ item, contentItems }) => html`
    ${styles}
    <style>
      select {
        font-size: 1.5em;
        font-weight: bold;
        width: 100%;
        margin-bottom: 1em;
      }
    </style>
    <select onchange=${contentSelectChange}>
      ${contentItems.map(({ hash, title }) => html`
        <option value=${hash} selected=${item === hash}>${title}</option>
      `)}
    </select>

    <schema-form
      id="bounds"
      style=${{ display: item && item !== 'project' ? 'block' : 'none' }}
      api="content"
      json-path="$.properties.bounds"
      layout="grid"
      onchange=${boundsChange}
      plain
    ></schema-form>

    <schema-form
      id="settings"
      api="content"
      json-path="$.properties.settings"
      content-selector="form > div > div.card-body > div.card > div.card-body"
      content-height="400"
      onchange=${settingsChange}
    ></schema-form>
    ${init}
  `,
});
