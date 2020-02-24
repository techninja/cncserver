/**
 * @file Project loader widget definition with bindings.
 */
/* globals cncserver, FileReader */
import { html } from '/modules/hybrids.js';

const allowedMimes = [
  'image/svg+xml',
  'image/jpeg',
  'image/png',
  'image/gif',
];

const rasterSettings = {
  brightness: 0.15,
  maxDensity: 12,
  spacing: 3,
  overlap: 1,
  sampleWidth: 2,
  style: 'spiral',
  skipWhite: true,
};

// Helper: Load a file object as text directly, content passed to callback.
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

function svgFileChange(host, { target: { files } }) {
  if (files.length) {
    loadAsText(files[0]).then((svgContent) => {
      // cncserver.api.actions.project(svgContent);
    });
  }
}

function rasterFileChange(host, { target: { files } }) {
  if (files.length) {
    loadAsText(files[0], true).then((imageURI) => {

    });
  }
}

function pushProject(host, event) {
  // Figure out if we're doing the file or the text field
  // Validate mimetype via axios.head -> headers -> content-type

  const path = host.shadowRoot.querySelector('input.path').value;

  cncserver.api.actions.project({
    operation: 'vectorize',
    body: path,
    settings: rasterSettings,
  });
  console.log('Push!', path);
}

// Initialize the widget.
function init(host) {
  if (!host.initialized) {
    host.initialized = true;
  }
}

// Export the widget definition.
export default styles => ({
  render: () => html`
    ${styles}
    <section class="box">
      <div class="field">
        <div class="control">
          <label-title icon="file-image">Upload a raster/vector:</label-title>
          <input
            class="input file"
            type="file"
            accept="${allowedMimes.join(',')}"
          >
        </div>
        <div class="control">
          <label-title icon="file-code">Path to file:</label-title>
          <input class="input path" type="text">
        </div>
        <button-single
          onclick="${pushProject}"
          title="Push Image"
          style="primary"
        ></button-single>
      </div>
    </section>
    ${init}
  `,
});
