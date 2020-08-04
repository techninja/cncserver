/**
 * @file JSON Schema Form element.
 *
 * Renders a valid JSON Schema into a form with accompanying events.
 */
/* globals document, Event, JSONEditor, cncserver, _ */
import { html, dispatch } from '/modules/hybrids.js';
import jsonPath from '/modules/jsonpath.js';
import apiInit from '/modules/utils/api-init.mjs';

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

    // Force the step value to something more precise, assuming float.
    const type = item.closest('[data-schematype]').getAttribute('data-schematype');
    item.step = type === 'integer' ? 1 : 0.01;
    item.value = parseFloat(out.textContent);

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

  // Hide items if the host requests it.
  if (host.hidePaths) {
    const paths = host.hidePaths.split(',');
    const pathItems = form.querySelectorAll('[data-schemapath]');
    pathItems.forEach((item) => {
      if (paths.includes(item.getAttribute('data-schemapath'))) {
        item.style.display = 'none';
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
}

/**
 * Get only the parts that are different from a complete/deep JSON object.
 *
 * @param {object} object
 *   Input object to check for diff against the base.
 * @param {object} base
 *   Base object to diff against the input.
 *
 * @returns {object}
 *   Only the differences between the two objects in full tree form.
 */
function dataDiff(object, base) {
  const result = _.pick(
    _.mapObject(object, (value, key) => (
      // eslint-disable-next-line no-nested-ternary
      (!_.isEqual(value, base[key]))
        // eslint-disable-next-line max-len
        ? ((_.isObject(value) && _.isObject(base[key])) ? dataDiff(value, base[key]) : value)
        : null
    )),
    value => (value !== null)
  );

  // Trim out empty keys
  const entries = Object.entries(result);
  entries.forEach(([key, val]) => {
    if (typeof val === 'object' && Object.keys(val).length === 0) {
      delete result[key];
    }
  });

  // TODO: Trim deeper changed objects.
  return result;
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
        detail: { diffObject, data: host.editor.data.current } }
      );
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
    get: host => (host.editor ? host.editor.data.current : {}),
    set: (host, value, lastValue) => {
      if (!host.editor) return {};
      if (host.debug) console.log('EXTERNAL DATA SET', value, host.id);
      const setData = host.appendData ? { ...host.editor.data.current, ...value } : value;

      // Only set the value if the data is any different.
      const completeNew = { ...host.editor.data.current, ...value };
      const setDiff = dataDiff(completeNew, host.editor.data.current);
      if (Object.entries(setDiff).length) {
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

  // Comma separated list of schema paths to hide.
  hidePaths: '',

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
    loading, contentSelector, contentHeight, extraStyles,
  }) => html`
    ${styles}
    <style>
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

      ${extraStyles}
    </style>

    <link href="/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    ${loading && html`<div>LOADING...</div>`}
    <form></form>
    ${init}
  `,
});
