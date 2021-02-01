/**
 * @file Content importer widget definition with bindings.
 */
/* globals cncserver, FileReader */
import { html } from '/modules/hybrids.js';

// Allowed mimetypes for local file upload, keyed by type.
const allowedMimes = {
  svg: ['image/svg+xml'],
  raster: ['image/jpeg', 'image/png', 'image/gif'],
  path: ['text/plain'],
  text: ['text/plain'],
  paper: ['text/plain', 'application/json'],
};

// Labels for content source types.
// TODO: Does this belong somewhere else?
const typeLabels = {
  svg: 'SVG',
  raster: 'Photo/Logo',
  path: 'SVG Pathdata',
  text: 'Text String',
  paper: 'Paper.js JSON',
};

/**
 * Convert a source type string into a formatted string.
 *
 * @param {string} type
 *   Source content type.
 *
 * @returns {string}
 *   The human readable label, or if missing, just the same type string given.
 */
function labelType(type) {
  return typeLabels[type] ? typeLabels[type] : type;
}

/**
 * Helper to load a file object as text directly.
 *
 * @param {object} file
 *   File object from the file input element files array.
 * @param {boolean} [asURI=false]
 *   Pass true to return the content as binary encoded data URI.
 *
 * @returns {promise}
 *   Promise that resolves with the content once FileReader completes.
 */
function loadAsText(file, asURI = false) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (loadedEvent) => {
      // Result contains loaded file contents.
      resolve(loadedEvent.target.result);
    };

    // Reader is Async, onload will be called above when done reading.
    if (asURI) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

/**
 * Handle API add content success state.
 *
 * @param {Hybrids} host
 *   The host element to operate on.
 */
function handleSuccess(host) {
  // Set loading to false.
  host.loading = false;

  // Clear all the input fields.
  host.shadowRoot.querySelector('input.path').value = '';
  host.shadowRoot.querySelector('input.file').value = '';
  host.shadowRoot.querySelector('textarea').value = '';
  host.shadowRoot.querySelector('input.title-text').value = '';
}

/**
 * Handle API add content failure state.
 *
 * @param {Hybrids} host
 *   The host element to operate on.
 * @param {*} err
 *   The error object returned from the API/Axios.
 */
function handleErr(host, err) {
  // Set message, displays modal.
  // TODO: Get better messages so we don't have to parse it like this.
  host.message = err.response ? JSON.stringify(err.response.data.message) : err.message;
  host.loading = false;
}

/**
 * Add content triggered by add button, parsing fields and settings.
 *
 * @param {string} mode
 *   Either local or remote, corresponding to API wrapper.
 * @param {string} type
 *   Source type of acceptable content, lower case string to pass to API.
 *
 * @returns {function}
 *   Hybrids host function.
 */
function addContent(mode, type) {
  return (host) => {
    // Don't do anything if we're already doing something.
    if (host.loading) return;
    host.showModal = true;

    const titleInput = host.shadowRoot.querySelector('input.title-text');
    const data = {
      title: titleInput.value.trim() || titleInput.placeholder,
    };

    host.loading = true;
    if (mode === 'remote') {
      const path = host.shadowRoot.querySelector('input.path').value;

      // URL overrides file upload.
      if (path) {
        cncserver.api.content.add.remote(type, path, data)
          .then(() => handleSuccess(host))
          .catch(err => handleErr(host, err));
      } else {
        // File upload!
        const fileInput = host.shadowRoot.querySelector('input.file');
        if (fileInput.files.length) {
          loadAsText(fileInput.files[0], type === 'raster').then((content) => {
            cncserver.api.content.add.local(type, content, data)
              .then(() => handleSuccess(host))
              .catch(err => handleErr(host, err));
          });
        } else {
          handleErr(host, new Error('No file given to upload.'));
        }
      }
    } else if (mode === 'local') { // Local content
      const content = host.shadowRoot.querySelector('textarea').value.trim();
      if (content) {
        cncserver.api.content.add.local(type, content, data)
          .then(() => handleSuccess(host))
          .catch(err => handleErr(host, err));
      } else {
        handleErr(host, new Error('No text content given.'));
      }
    }
  };
}

/**
 * Initialize the widget.
 *
 * @param {Hybrids} host
 *   The host element to operate on.
 */
function init(host) {
  if (!host.initialized) {
    host.initialized = true;

    // Get the full content request schema for the acceptable source types.
    cncserver.api.content.schema().then(({ data: schema }) => {
      host.sourceTypes = [...schema.properties.source.properties.type.enum];
      host.loading = false;
    });
  }
}

/**
 * Hide the modal message, triggered from modal item click.
 *
 * @param {*} host
 *   The host element to operate on.
 */
function hideModal(host) {
  host.message = '';
}

/**
 * Get the text input string/html note for a specific type.
 *
 * @param {string} type
 *   One of the acceptable content types.
 *
 * @returns {string}
 *   If exists, a note for the given type, otherwise an empty string.
 */
function getTextNote(type) {
  const d = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs';
  const notes = {
    raster: html`complete <a href="${d}">Data URI</a>`,
    paper: 'valid JSON content export without layers',
    text: 'UTF-8 compatible, limited only by character set',
  };

  return notes[type] ? html` (${notes[type]})` : '';
}

/**
 * Change type dropdown element trigger.
 *
 * @param {Hybrids} host
 *   The host element to operate on.
 * @param {Event} event
 *   Full DOM event of the change.
 */
function changeType(host, event) {
  host.type = event.target.value;
}

/**
 * Change mode tab element trigger.
 *
 * @param {Hybrids} host
 *   The host element to operate on.
 * @param {Event} event
 *   Full DOM event of the change.
 */
function changeMode(host, event) {
  if (event.target.activeItem) {
    // TODO: Why is this ever triggered without a correct value on internal input?
    host.mode = event.target.activeItem;
  }
}

// Export the widget definition.
export default styles => ({
  sourceTypes: [],
  type: 'svg',
  mode: 'remote',
  message: '',
  loading: true,

  render: ({
    sourceTypes, type, mode, message, loading,
  }) => html`
    ${styles}
    <style>
      :host {
        display: block;
        position: relative;
        overflow: hidden;
      }

      section {
        position: relative;
      }

      #source-type-wrapper {
        position: absolute;
        right: 1em;
      }

      @media only screen and (max-width: 1230px) {
        #source-type-wrapper {
          position: relative;
          right: auto;
          margin-bottom: 1em;
        }
      }

      #source-type {
        font-size: 1.2em;
      }

    </style>
    <notify-loading debug active=${loading} text="Loading..."></notify-loading>
    <notify-modal
      header="Error Adding Content:"
      message=${message}
      type="danger"
      onclose=${hideModal}
      active=${!!message}
      limit
    >
      <button-single
        onclick=${hideModal}
        text="Ok"
        type="warning"
        fullwidth
      ></button-single>
    </notify-modal>
    <section>
      <div id="source-type-wrapper">
        <label for="source-type">Source Type:</label>
        <select id="source-type" onchange=${changeType}>
          ${sourceTypes.map(name => html`
          <option value=${name}>${labelType(name)}</option>
          `)}
        </select>
      </div>
      <tab-group onchange=${changeMode}>
        <tab-item text="Upload/Remote" icon="cloud-upload-alt" name="remote" active>
          <div class="field">
            <div class="control">
              <label-title icon="file-image">Upload ${labelType(type)}:</label-title>
              <input
                class="input file"
                type="file"
                accept="${allowedMimes[type].join(',')}"
              >
            </div>
            <br>
            <div class="control">
              <label-title icon="file-code">URL path to ${labelType(type)}:</label-title>
              <input class="input path" type="text">
            </div>
          </div>
        </tab-item>
        <tab-item text="Paste/Text" icon="keyboard" name="local">
          <div class="field">
            <div class="control">
              <label-title icon="align-left">
                ${labelType(type)} as text${getTextNote(type)}:
              </label-title>
              <textarea class="input textarea" rows="4"></textarea>
            </div>
          </div>
        </tab-item>
      </tab-group>
      <br>
      <div class="field">
        <div class="control">
          <label-title icon="file-signature">Content Title:</label-title>
          <input
            class="input title-text"
            type="text"
            placeholder="New ${labelType(type)} content"
          >
        </div>
      </div>
      <button-single
        onclick=${addContent(mode, type)}
        text=${`Add ${labelType(type)}`}
        type="primary"
        loading=${loading}
        icon="plus"
        fullwidth
      ></button-single>
    </section>
    ${init}
  `,
});
