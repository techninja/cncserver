/**
 * @file Height adjustment settings widget definition with bindings.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}
    <h3>Height Adjuster</h3>
    <!-- TODO: This.
    <wl-slider
      id="height-adjust"
      value="20"
      buffervalue="80"
      step="10"
      thumblabel
    ></wl-slider> -->
  `,
});
