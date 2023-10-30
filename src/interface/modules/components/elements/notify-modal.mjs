/**
 * @file Generic modal notifier component.
 */
import { html, dispatch } from '/modules/hybrids.js';

function dispatchClose(host) {
  dispatch(host, 'close');
}

export default styles => ({
  icon: '',
  type: 'primary',
  message: '',
  header: 'Alert',
  active: false,
  limit: false,

  render: ({
    type, icon, header, active, message, limit,
  }) => {
    const messageClasses = {
      'modal-card-body': true,
    };
    messageClasses[`is-${type}`] = true;

    const modalClasses = {
      modal: true,
      'is-active': active,
      limit,
    };

    return html`
    ${styles}
    <style>
      :host {
        display: block;
        overflow: hidden;
      }

      .modal-content {
        width: 80%;
        overflow: hidden;
      }

      .message-body {
        overflow-y: auto;
      }

      .modal.limit {
        position: absolute;
      }

      header .icon {
        color: black;
        margin-right: 1em;
        font-size: 1.5em;
      }
    </style>

    <div class=${modalClasses}>
      <div class="modal-background" onclick=${dispatchClose}></div>
      <div class="modal-card">
        <header class="modal-card-head">
          ${icon && html`
            <span class="icon">
              <i class="fas fa-${icon}" aria-hidden="true"></i>
            </span>
          `}
          <p class="modal-card-title">${header}</p>
          <button class="delete" aria-label="close" onclick=${dispatchClose}></button>
        </header>
        <section class=${messageClasses}>
          ${message && html`<p>${message}</p>`}
          <slot name="message"></slot>
        </section>
        <footer class="modal-card-foot">
          <slot name="buttons"></slot>
        </footer>
      </div>
    </div>
  `;
  },
});
