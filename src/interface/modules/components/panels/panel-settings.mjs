/**
 * @file Tab panel definition with bindings for Settings.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}

    <div class="box">
      <height-settings></height-settings>
    </div>
  `,
});
