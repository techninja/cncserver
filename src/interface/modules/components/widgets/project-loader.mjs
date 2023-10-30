/**
 * @file Project loader widget definition with bindings.
 */
/* globals cncserver */
import { html, dispatch } from '/modules/hybrids.js';

// Change factory for projects based on hash.
function currentProjectChangeFactory() {
  return {
    set: (host, value) => {
      if (value && host.project.hash !== value) {
        cncserver.api.projects.item.stat(value).then(({ data }) => {
          host.project = data;

          // host.shadowRoot.querySelector(`#${value}`).scrollIntoView();
          dispatch(host, 'change');
        }).catch(() => {
          // if there was a problem, just default to nothing.
          host.project = { title: '', description: '' };
        });
      }
      return value;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = '';
        host.project = { title: '', description: '' };
      }
    },
  };
}

// Callback for change event on project info inputs.
function infoChange(host) {
  const inputs = host.shadowRoot.querySelectorAll('input');
  cncserver.api.projects.item.update(host.current, {
    name: inputs.item(0).value.trim() || inputs.item(0).placeholder,
    title: inputs.item(0).value.trim() || inputs.item(0).placeholder,
    description: inputs.item(1).value.trim() || inputs.item(1).placeholder,
  }).catch(() => { });
}

function openProject(hash) {
  return (host) => {
    host.current = hash;
    cncserver.api.projects.open(hash).catch((err) => {
      console.log('Problem opening project', err);
    });
  };
}

// Initialize the widget.
function init(host) {
  if (!host.initialized) {
    host.initialized = true;

    // Load all projects.
    cncserver.api.projects.stat().then(({ data }) => {
      host.items = [...data.items];
      host.current = data.current;
    });
  }
}

// Export the widget definition.
export default styles => ({
  current: currentProjectChangeFactory(),
  project: {},
  items: [],
  render: ({ project, items, current }) => html`
    ${styles}
    <div id="projects">
      <div class="field">
        <div class="control">
          <label-title icon="file-image">Project Details:</label-title>
          <input
            class="input"
            type="text"
            id="title"
            placeholder="New Project Title"
            onchange=${infoChange}
            value=${project.title}
          >
          <input
            class="input"
            type="text"
            id="description"
            placeholder="New Project Description"
            onchange=${infoChange}
            value=${project.description}
          >
        </div>
        <br>
        <div class="control">
          <label-title icon="file-code">Projects:</label-title>
        </div>
        <div class="box list">
          ${items.map(item => html`
            <div
              class=${{ card: 1, 'is-active': item.hash === current }}
              onclick=${openProject(item.hash)}
              id=${item.hash}
              title=${`Load Project: ${item.title}`}
              >
              <div class="card-image">
                <figure class=${{ image: 1, empty: !item.preview }}>
                  ${item.preview && html`<img src=${item.preview}>`}
                </figure>
              </div>
              <div class="card-content">
                <p class="title is-4">${item.title}</p>
                <time datetime=${item.modified}>
                  ${new Date(item.modified).toLocaleDateString()}
                </time>
                <div class="content">${item.description}</div>
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
    ${init}
  `,
});
