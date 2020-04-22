/**
 * @file Tab group element definition.
 */
import TabItem from './tab-item.mjs';

import { html, children, dispatch } from '/modules/hybrids.js';

// Function factory takes tab name and returns callback
// which can be added as event listener
function activate(name) {
  return (host) => {
    // Set next active element by it's name
    host.activeItem = name;

    // After change custom event is dispatched
    // for the user of tab-group element
    dispatch(host, 'change');
  };
}

export default styles => ({
  // Children defined in 'tab-item.js'
  items: children(TabItem),

  // Sets and returns active item by name, which can be
  // used by the user of tab-group element
  activeItem: {
    set: ({ items }, name) => items
      .filter(item => (item.active = item.name === name))
      .map(({ name }) => name)[0],
  },
  render: ({ items }) => html`
    ${styles}
    <nav class="tabs is-boxed">
      <ul>
      ${items.map(({ title, active, icon, name }) => html`
        <li class="${active ? 'is-active' : ''} ${active ? 'active' : ''}" onclick="${activate(name)}">
          <a>
            <span class="icon is-small"><i class="fas fa-${icon}" aria-hidden="true"></i></span>
            <span>${title}</span>
          </a>
        </li>
      `.key(name))}
      </ul>
    </nav>

    <slot></slot>
  `,
});
