/**
 * @file Main title element definition with bindings.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import apiInit from '/modules/utils/api-init.mjs';

function init(host) {
  apiInit(() => {
    if (!host.initialized) {
      host.initialized = true;
      cncserver.api.settings.bot().then(({ data: bot }) => {
        cncserver.api.settings.global().then(({ data: { serialPath } }) => {
          host.subtitle = `Controlling ${bot.name} through ${serialPath} on ${cncserver.api.server.domain}.`;
        });
      });
    }
  });
}

export default styles => ({
  initialized: false,
  subtitle: 'Loading...',

  render: ({ subtitle }) => html`
    ${styles}
    <section class="hero is-dark is-bold">
      <div class="hero-body">
        <div class="container">
          <figure class="image is-128x128 logo">
            <img src="icon.png" />
          </figure>

          <h1 class="title">CNC Server client v3.0-beta1</h1>
          <p class="subtitle">${subtitle}</p>
          <div class="children">
            <slot></slot>
          </div>
        </div>
      </div>
    </section>
    ${init}
  `,
});
