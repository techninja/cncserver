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
  onStyle: 'success',
  offTitle: 'Off',
  offIcon: 'frown',
  offStyle: '',

  render: (props) => {
    const word = props.state ? 'on' : 'off';
    const style = props[`${word}Style`];
    const title = props[`${word}Title`];
    const icon = props[`${word}Icon`];

    const aClasses = { button: true, 'is-fullwidth': props.fullwidth };
    if (style) aClasses[`is-${style}`] = true;

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
