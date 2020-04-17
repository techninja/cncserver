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
    <section class="box" id="projects">
      <div class="field">
        <div class="control">
          <label-title icon="file-image">Project Details:</label-title>
          <input
            class="input"
            type="text"
            id="title"
            value=${project.title}
          >
          <input
            class="input"
            type="text"
            id="title"
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
                <figure class="image"><img src=${item.preview}></figure>
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
    </section>
    ${init}
  `,
});
