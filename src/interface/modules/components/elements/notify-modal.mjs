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

  render: ({ type, icon, header, desc, active, message, limit }) => {
    const messageClasses = {
      message: true,
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
        height: 100%;
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

      slot {
        display: block;
        width: 100%;
        margin-top: 1em;
      }
    </style>

    <div class=${modalClasses}>
      <div class="modal-background" onclick=${dispatchClose}></div>
      <div class="modal-content">
        <article class=${messageClasses}>
          <div class="message-header">
            <p>${header}</p>
            <button class="delete" aria-label="delete" onclick=${dispatchClose}></button>
          </div>
          <div class="message-body">
            <p>${message}</p>
            <div class="buttons"><slot></slot></div>
          </div>
        </article >
      </div >
    </div >
  `
  },
});
