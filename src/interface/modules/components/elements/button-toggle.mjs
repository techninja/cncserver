/**
 * @file Toggle button element definition.
 */
import { html, dispatch } from '/modules/hybrids.js';

function click() {
  return (host) => {
    host.state = !host.state;

    // After change custom event is dispatched
    dispatch(host, 'change');
  };
}

export default styles => ({
  state: false,
  fullwidth: false,
  onTitle: 'On',
  onIcon: 'smile',
  onType: 'success',
  offTitle: 'Off',
  offIcon: 'frown',
  offType: '',

  render: (props) => {
    const word = props.state ? 'on' : 'off';
    const type = props[`${word}Type`];
    const title = props[`${word}Title`];
    const icon = props[`${word}Icon`];

    const aClasses = { button: true, 'is-fullwidth': props.fullwidth };
    if (type) aClasses[`is-${type}`] = true;

    const iconClasses = { fas: true };
    if (icon) iconClasses[`fa-${icon}`] = true;

    return html`
      ${styles}

      <a class="${aClasses}" onclick="${click()}">
        <span class="icon"><i class="${iconClasses}" aria-hidden="true"></i></span>
        <span>${title}</span>
      </a>
    `;
  },
});
