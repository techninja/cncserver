/**
 * @file Tab panel definition with bindings for Advanced.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}

    <height-settings></height-settings>
    <br>

    <content-importer></content-importer>
    <br>

    <project-loader></project-loader>
  `,
});
