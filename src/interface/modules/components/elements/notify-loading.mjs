/**
 * @file Generic loading notifier component.
 */
import { html } from '/modules/hybrids.js';

export default styles => ({
  icon: '',
  style: '',
  text: '',
  desc: 'Please wait...',
  color: '',
  opacity: 0.8,
  active: false,
  debug: false,

  render: ({ icon, desc, text, active, color, opacity }) => html`
    ${styles}
    <style>
      :host {
        display: inline-block;
        position: absolute;
        width: 100%;
        height: 100%;
        z-index: ${active ? 10 : -10};
        cursor: ${active ? 'wait' : 'inherit'};
      }

      .wrapper {
        width: 100%;
        height: 100%;
        transition: opacity .3s, z-index 1s;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 6px;
        opacity: 0;
        background-color: ${color || 'gray'};
        background-image: url(/images/loading.svg);
        background-repeat: no-repeat;
        background-size: contain;
        background-position: center;
      }

      .wrapper.active {
        opacity: ${opacity};
      }

    </style>

    <div class=${{ wrapper: 1, active }} title="${desc}">
      <label>
        ${icon && html`<span class="icon"><i class="fas fa-${icon}" aria-hidden="true"></i></span>`}
        ${text}
      </label>
    </div>
  `,
});
