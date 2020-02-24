/**
 * @file Imports all components as needed by the GUI.
 */
import { define, html } from '/modules/hybrids.js';

import elements from './elements/index.mjs';
import widgets from './widgets/index.mjs';
import panels from './panels/index.mjs';

const styles = html`
  <link rel="stylesheet" href="/bulma/bulma.min.css">
  <link rel="stylesheet" href="/font-awesome/fontawesome.min.css">
  <link rel="stylesheet" href="/font-awesome/solid.min.css">
  <link rel="stylesheet" href="/font-awesome/brands.min.css">
  <link rel="stylesheet" href="/styles/interface.css">
`;

// Define all Hybrids custom components from included indexes.
Object.entries({ ...elements(styles), ...widgets(styles), ...panels(styles) })
  .forEach(([tagName, element]) => {
    define(tagName, element);
  });
