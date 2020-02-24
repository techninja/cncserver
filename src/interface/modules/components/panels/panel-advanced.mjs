/**
 * @file Tab panel definition with bindings for Advanced.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}

    <project-loader></project-loader>
    <br>
  `,
});
