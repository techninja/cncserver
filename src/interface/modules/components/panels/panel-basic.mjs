/**
 * @file Tab panel definition with bindings for Basic.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  render: () => html`
    ${styles}

    <scratch-controls></scratch-controls>
    <br>
    <tools-basic></tools-basic>
    <br>
    <height-presets></height-presets>
  `,
});
