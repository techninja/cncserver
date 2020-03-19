/**
 * @file Tab group element definition.
 */
/* globals window */
import ColorsetItem from './colorset-item.mjs';
import apiInit from '/modules/utils/api-init.mjs';
import {
  html, children, dispatch, property
} from '/modules/hybrids.js';

function findItem(items, name) {
  return items.filter(item => (item.active = item.name === name))[0];
}

// Trigger deletion of the colorset item.
function removeItem(title, name) {
  return (host, event) => {
    event.stopPropagation();

    // eslint-disable-next-line no-alert
    if (window.confirm(`Delete Color: ${name} - "${title}"?`)) {
      dispatch(host, 'remove', { detail: { name } });
    }
  };
}

// Trigger editing of the item
function editItem(name) {
  return (host) => {
    host.activeItem = name;
    host.isEditing = !!findItem(host.items, name);

    // After change custom event is dispatched
    // for the user of tab-group element
    dispatch(host, 'change');
  };
}

// Trigger editing of the item
function cancelEdit(host) {
  // console.log('Edit', name);
  host.activeName = '';
  host.activeColor = '#000000';
  host.activeTitle = '';
  host.activeItem = '';
  host.isEditing = !!findItem(host.items, '');
  host.errorName = false;
  host.errorTitle = false;

  // After change custom event is dispatched
  // for the user of tab-group element
  dispatch(host, 'change');
}

function saveItem(op) {
  return (host) => {
    // First, check that we have all the info we need.
    if (!host.activeName.trim()) {
      host.errorName = true;
      host.render();
      return;
    }

    if (!host.activeTitle.trim()) {
      host.errorTitle = true;
      host.render();
      return;
    }

    // Actually dispatch the change, then clear.
    dispatch(host, op, {
      detail: {
        name: host.activeName,
        color: host.activeColor,
        title: host.activeTitle,
      },
    });

    cancelEdit(host);
  };
}

// Catch edits to the name field, that changes what we're editing.
function updateActiveName(host, event) {
  host.activeName = event.target.value;
  host.isEditing = !!findItem(host.items, host.activeName);
}

// Catch the first render of a host element, and dispatch refresh.
function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      dispatch(host, 'init');
    }
  });
}

export default styles => ({
  // Children defined in 'colorset-item.js'
  items: children(ColorsetItem),
  initialized: false,
  activeName: '',
  activeColor: '#000000',
  activeTitle: '',
  isEditing: false,
  errorName: false,
  errorTitle: false,

  // Sets and returns active item by name, which can be
  // used by the user of tab-group element
  activeItem: {
    set: (host, name) => {
      const item = findItem(host.items, name);

      if (item) {
        host.activeName = item.name;
        host.activeTitle = item.title;
        host.activeColor = item.color;
      }
      return item ? item.name : '';
    },
  },
  render: ({
    items,
    activeName,
    activeTitle,
    activeColor,
    isEditing,
    errorName,
    errorTitle,
  }) => html`
    ${styles}

    <div class="field columns is-multiline" id="colorset">
      <section class="column">
        <div class="list is-hoverable">
          ${items.map(({
    name, title, color, active,
  }) => html`
              <div
                title="Edit this Color"
                class="${{ 'colorset-item': true, card: true, active }}"
                onclick="${editItem(name)}"
              >
                <header class="card-header">
                  <b style="${{ backgroundColor: color }}">${name}</b>
                  <p class="card-header-title">${title}</p>
                  <a
                    class="card-header-icon"
                    onclick="${removeItem(title, name)}"
                    title="Delete this color"
                  >
                    <span class="icon is-danger">
                      <i class="fas fa-times-circle" aria-hidden="true"></i>
                    </span>
                  </a>
                </header>
              </div>
            `)}
        </div>
      </section>
      <section id="color-editor" class="column is-half">
        <div class="columns is-multiline">
          <section class="column">
            <div class="field">
              <label class="label">Tool/ID</label>
              <div class="control">
                <input
                  class="${{ input: true, id: true, 'is-danger': errorName }}"
                  type="text"
                  placeholder="Tool or ID"
                  value="${activeName}"
                  oninput="${updateActiveName}"
                />
              </div>
              <p class="help">
                Unique identifier for the color, match to a tool to change to it
              </p>
            </div>

            <div class="field">
              <label class="label">Color</label>
              <div class="control">
                <input
                  class="input color"
                  type="color"
                  value="${activeColor}"
                  onchange="${html.set('activeColor')}"
                />
              </div>
              <p class="help">
                Path fill and stroke nearest this color will snap to the
                matching tool/id
              </p>
            </div>
          </section>
          <section class="column is-half">
            <div class="field">
              <label class="label">Display Name</label>
              <div class="control">
                <input
                  class="${{ input: true, name: true, 'is-danger': errorTitle }}"
                  type="text"
                  placeholder="Display Name"
                  value="${activeTitle}"
                  oninput="${html.set('activeTitle')}"
                />
              </div>
              <p class="help">
                Human readable label for the color and/or implement
              </p>
            </div>

            <div class="field">
              <button-single
                onclick="${cancelEdit}"
                title="Cancel"
                icon="window-close"
                style="danger"
              ></button-single>
              ${!isEditing
                && html`
                  <button-single
                    onclick="${saveItem('create')}"
                    title="Add"
                    icon="plus-circle"
                    style="success"
                  ></button-single>
                `}
              ${isEditing
                && html`
                  <button-single
                    onclick="${saveItem('save')}"
                    title="Save"
                    icon="save"
                    style="warning"
                    >${isEditing}</button-single
                  >
                `}
            </div>
          </section>
        </div>
      </section>
    </div>
    ${init}
  `,
});
