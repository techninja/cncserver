/**
 * @file JSON Schema Form element.
 *
 * Renders a valid JSON Schema into a form with accompanying events.
 */
/* globals document, Event, JSONEditor, cncserver, _ */
import { html, dispatch } from '/modules/hybrids.js';
import jsonPath from '/modules/jsonpath.js';
import apiInit from '/modules/utils/api-init.mjs';
import dataDiff from '/modules/utils/data-diff.mjs';

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

/**
 * Callback for post-JSONEditor build form adjustments.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 */
function customizeForm(host) {
  const form = host.shadowRoot.querySelector('form');

  // Customize the range sliders.
  const inputs = form.querySelectorAll('input[type=range]');
  inputs.forEach((item) => {
    // Initial build setup value pulled from initial output.
    const out = item.parentNode.querySelector('output');

    // Hide it.
    out.style.display = 'none';

    // Add a number input option.
    const num = document.createElement('input');
    num.type = 'number';
    num.min = item.min;
    num.max = item.max;
    num.step = item.step;
    num.value = item.value;

    // Lock the two together through change/input events.
    num.addEventListener('change', () => {
      item.value = num.value;
      item.dispatchEvent(new Event('change'));
    });
    item.addEventListener('input', () => { num.value = item.value; });

    // Insert it above the slider.
    item.parentNode.insertBefore(num, item);
  });

  // Insert forms inside preset keys.
  matchingItems(host, host.presetPaths, item => {
    if (item.getAttribute('data-schemapath') === 'root.implement') {
      addPresetSelect(host, item, 'implement');
    }

    if (item.getAttribute('data-schemapath') === 'root.toolset') {
      addPresetSelect(host, item, 'toolset');
    }
  });

  // Hide items if the host requests it.
  matchingItems(host, host.hidePaths, item => { item.style.display = 'none'; });

  // Disable items if the host requests it.
  matchingItems(host, host.disablePaths, item => {
    item.querySelector('.form-control').disabled = true;
  });
}

/**
 * Fold in a replacement form item to select a preset based on type.
 *
 * @param {*} host
 * @param {*} item
 * @param {*} type
 */
function addPresetSelect(host, item, type) {
  // Create selector based on type.
  const input = item.querySelector('input');
  const select = document.createElement(`preset-select-${type}`);
  item.appendChild(select);

  select.classList.add('preset-selector');
  select.selected = input.value;

  // Switch for allow inherit.
  if (type === 'implement') {
    console.log('Implement preset...', host.editor.schema.properties?.implement?.default);
    if (host.editor.schema.properties?.implement?.default === '[inherit]') {
      select.allowInherit = true;
    }
  }

  // Bind change to insert value.
  select.addEventListener('change', () => {
    input.value = select.selected
    input.dispatchEvent(new Event('change'));
  });

  // Bind to changes from content.
  input.addEventListener('input', () => {
    console.log('Change From Input', input.value);
    select.selected = input.value;
  });

  // Hide elements.
  item.querySelector('input').style.display = 'none';
  item.querySelector('small').style.display = 'none';
}

/**
 * Callback runner for modifying forms.
 *
 * @param {Element} host
 *   The parent host element.
 * @param {string} pathStrings
 *   Comma separated string from host property, to be parsed as schemapath matches.
 * @param {function} [cb=(item) => item]
 *   Callback called on each matching form element wrapper.
 */
function matchingItems(host, pathStrings, cb = (item) => item) {
  const form = host.shadowRoot.querySelector('form');
  if (pathStrings) {
    const paths = pathStrings.split(',');
    const pathItems = form.querySelectorAll('[data-schemapath]');
    pathItems.forEach((item) => {
      if (paths.includes(item.getAttribute('data-schemapath'))) {
        cb(item);
      }
    });
  }
}

/**
 * Callback for external data post build form updates.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 */
function externalUpdateForm(host) {
  // Update the number input for the range sliders.
  const inputs = host.shadowRoot.querySelectorAll('input[type=range]');
  inputs.forEach((item) => {
    item.previousSibling.value = item.value;
  });

  // Ensure presets have correct selections.
  matchingItems(host, host.presetPaths, item => {
    const selector = item.querySelector('.preset-selector')
    selector.selected = item.querySelector('input').value;

    // Try to get parent preset option (currently only for implements).
    if (selector.allowInherit) {
      selector.parentPreset = host.parentNode.host.parentImplement || '';
      selector.color = host.parentNode.host?.data?.color || '#000000';
    }
  });

  // Disable items if the host requests it.
  mapFormItemsMatching(host, '.form-control[disabled]', item => item.disabled = false);
  matchingItems(host, host.disablePaths, item => {
    item.querySelector('.form-control').disabled = true;
  });
}

/**
 * Run a map function on a result set of a query within the form.
 *
 * @param {hybrids} host
 *   Host element.
 * @param {string} query
 *   Query string to find items within the form.
 * @param {function} mapFunc
 *   Function to use within map.
 *
 * @returns {array}
 *   Array of returns from map function.
 */
function mapFormItemsMatching(host, query, mapFunc) {
  return Array.from(host.shadowRoot.querySelector('form').querySelectorAll(query)).map(mapFunc);
}

/**
 * Direct callback for JSONEditor changes.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 */
function dataChange(host) {
  // Sync data pointer.
  host.editor.data.current = host.editor.getValue();

  if (!host.editor.data.last) {
    host.editor.data.last = { ...host.editor.data.current };
    if (host.debug) console.log('host.editor.data.last SET');
  } else {
    // Don't run a change event for external data push.
    if (host.editor.data.setExternally) {
      host.editor.data.setExternally = false;

      // Update values.
      externalUpdateForm(host);

      // Dispatch host event for build customization update.
      dispatch(host, 'build-update', {
        detail: { form: host.shadowRoot.querySelector('form') },
      });

      host.editor.data.last = { ...host.editor.data.current };
      if (host.debug) console.log('EXTERNAL, last data set', host.editor.data.last);
      return;
    }

    const diffObject = dataDiff(host.editor.data.current, host.editor.data.last);

    // Are there any actual changes?
    if (Object.keys(diffObject).length) {
      // Dispatch change with changed values.
      dispatch(host, 'change', {
        detail: { diffObject, data: host.editor.data.current }
      });
      if (host.debug) console.log('Diff', diffObject);
      host.editor.data.last = { ...host.editor.data.current };
    } else if (host.debug) {
      console.log('NO CHANGES');
    }
  }
}

/**
 * Set the host schema by querying a specific API endpoint.
 *
 * @param {hybrids} host
 *   Host item to operate on.
 * @param {string} endpoint
 *   Endpoint available via cncserver.api.[endpoint].
 *
 * @returns {boolean}
 *   True if it worked, false otherwise.
 */
function setSchemaFromEndpoint(host, endpoint) {
  // Is this a valid endpoint?
  if (cncserver.api[endpoint]) {
    host.loading = true;
    cncserver.api[endpoint].schema().then(({ data }) => {
      // With the schema, select only the JSON Path element.
      if (host.jsonPath) {
        const select = jsonPath.query(data, host.jsonPath);
        if (select[0]) {
          [host.schema] = select;
          return true;
        }
      }
      host.schema = data;
    });
    return true;
  }

  return false;
}

/**
 * Factory for managing host schema API path change/value.
 *
 * @param {string} [defaultAPI={}]
 *   Hash value from hybrids factory handler.
 *
 * @returns {hybrids factory}
 */
function apiChangeFactory(defaultAPI = '') {
  return {
    set: (host, value) => {
      console.log('Api change...', value);
      if (host.shadowRoot && host.initialized) {
        // If it worked, set value.
        if (setSchemaFromEndpoint(host, value)) {
          console.log('Good API!');
          return value;
        }

        console.log('Bad API!');
        // Bad Endpoint, cancel the value.
        return '';
      }

      console.log('Not ready', value);

      // We're not ready to test, let it save;
      return value;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defaultAPI;
      }
    },
  };
}


/**
 * Factory for managing host schema change/value.
 *
 * @param {string} [defaultSchema={}]
 *   Hash value from hybrids factory handler.
 *
 * @returns {hybrids factory}
 */
function schemaChangeFactory(defaultSchema = {}) {
  return {
    set: (host, value) => {
      if (host.shadowRoot) {
        const editorSettings = {
          ...globalJSONEditorSettings,
          object_layout: host.layout,
          schema: value,
        };

        // Enable array editing.
        if (host.arrays) {
          editorSettings.disable_array_add = false;
          editorSettings.disable_array_delete = false;
        }

        // Actually render the editor based on the schema.
        const form = host.shadowRoot.querySelector('form');
        host.editor = new JSONEditor(form, editorSettings);

        // Setup base data store.
        host.editor.data = {
          setExternally: false,
          last: null,
          current: null,
        };

        // Form is built, run form customization.
        customizeForm(host);

        // Dispatch host event for build customization.
        dispatch(host, 'build', { detail: { form } });

        // Set initial data of form.
        host.editor.data.current = host.editor.getValue();

        // Trigger an initial change to set values.
        host.editor.on('change', () => { dataChange(host); });
        host.loading = false;

        return value;
      }

      return {};
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defaultSchema;
      }
    },
  };
}

/**
 * Factory for managing data change/value.
 *
 * @returns {hybrids factory}
 */
function dataChangeFactory() {
  return {
    // TODO: This seems to be caching and can be behind, even though it shouldn't.
    get: host => (host.editor ? host.editor.data.current : {}),
    set: (host, value, lastValue) => {
      if (!host.editor) return {};
      if (host.debug) console.log('EXTERNAL DATA SET', value, host.id);
      const setData = host.appendData ? { ...host.editor.data.current, ...value } : value;

      // Only set the value if the data is any different.
      const completeNew = { ...host.editor.data.current, ...value };
      const setDiff = dataDiff(completeNew, host.editor.data.current);
      if (Object.entries(setDiff).length) {
        // TODO: This fails as dependent keys are set to undefined!
        // @see https://github.com/json-editor/json-editor/issues/819
        if (host.debug) console.log('External Set diff is', setDiff);
        host.editor.data.setExternally = true;
        if (host.editor.setValue(setData)) {
          host.editor.data.current = host.editor.getValue();
          return host.editor.data.current;
        }
      } else if (host.debug) {
        console.log('No difference', host.id);
      }

      return lastValue;
    },
    connect: () => () => { },
  };
}

/**
 * Initialize the element.
 *
 * @param {Hybrids} host
 */
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;

      // Handle changes that couldn't happen until actual API init.
      setSchemaFromEndpoint(host, host.api);
    }
  });
}

export default styles => ({
  initialized: false,
  loading: true,
  debug: false,

  // Either "Normal" or "grid".
  layout: 'normal',

  // Whether setting data will append to existing data. False will apply to default data.
  appendData: false,

  // Whether to enable JSONEditor array add/delete.
  arrays: false,

  // Dynamic minimalization of forms for taking up less space.
  minimal: false,

  // Remove immediate box styles.
  plain: false,

  // Comma separated list of schema paths to modify.
  hidePaths: '', // Entirely hide input.
  disablePaths: '', // Lock & Disable (but display).
  presetPaths: '', // Replace with preset selector.

  // Style selector and pixel height of "content area".
  contentSelector: '',
  contentHeight: 250,

  // Any extra styles to apply to the form.
  extraStyles: '',
  editor: {},
  data: dataChangeFactory(),
  schema: schemaChangeFactory(),

  // TODO: Implement factory to manage changes of these two.
  api: '',
  jsonPath: '',

  render: ({
    loading, contentSelector, contentHeight, extraStyles, minimal, plain,
  }) => html`
    ${styles}
    <style>
      :host {
        display: block;
      }

      /* Cancel Culture */
      form > div > span.btn-group, form > div > h3,
      form > div > p, .tab-pane > div > div > h3.card-title {
        display: none !important;
      }

      /* Fix input range padding issue */
      input[type=range] {
        padding: 0;
      }

      /* Fix double object wrapping */
      form > div[data-schematype=object] > div.card-body,
      form > div[data-schematype=object] > div.card-body > div.card > div.card-body {
        padding: 0;
        border-width: 0;
      }

      /* Fix inner grouping margin */
      form > div div.card-body {
        margin-bottom: 0 !important;
      }

      /* Allow custom content scroll */
      ${contentSelector && html`${contentSelector} {
        height: ${contentHeight}px;
        overflow-y: auto;
        overflow-x: hidden;
      }`}

      /* Minimal mode styles */
      form.minimal .form-group .form-text {
        display: none;
      }

      form.minimal .form-group:focus-within .form-text {
        display: block;
        position: absolute;
        z-index: 1;
        background-color: aliceblue;
        border: 2px solid blueviolet;
        border-top: none;
        border-radius: 0 0 1em 1em;
        padding: 0.5em;
        margin-right: 1em;
        box-shadow: 0px 10px 15px 4px rgba(0,0,0,0.75);
      }

      form.minimal h3.card-title > label {
        font-size: 16px;
      }

      form.minimal h3.card-title > button,
      form.minimal div.row > [data-schematype=array] > p {
        display: none;
      }

      /* Plain mode styles */
      form.plain > div > div.card-body {
        background-color: transparent !important; box-shadow: none;
      }

      ${extraStyles}
    </style>

    <link href="/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    ${loading && html`<div>LOADING...</div>`}
    <form class=${{ minimal, plain }}></form>
    ${init}
  `,
});
