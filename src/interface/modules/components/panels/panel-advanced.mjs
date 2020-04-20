/**
 * @file Tab panel definition with bindings for Advanced.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}

    <div class="box">
      <height-settings></height-settings>
    </div>
    <br>

    <div class="box">
      <project-loader></project-loader>
    </div>
  `,
});
