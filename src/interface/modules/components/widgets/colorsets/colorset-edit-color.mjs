/**
 * @file Colorset Editor: edit single color element definition.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';
import dataDiff from '/modules/utils/data-diff.mjs';

function saveDone(host) {
  cncserver.api.colors.save(dataDiff(host.form.editor.data.current)).then(() => {
    handleSwitch(host.returnTo, { reload: true })(host);
  });
}

export default (styles) => ({
  initialized: false,
  returnTo: 'colors',
  parentImplement: '',
  data: {},
  form: ({ render }) => render().querySelector('schema-form'),

  render: ({ data, returnTo }) => {
    // TODO: Allow Edit of implement.

    return html`
    ${styles}
    <button-single
      text="Save"
      icon="save"
      style="success"
      onclick=${saveDone}
    ></button-single>
    <button-single
      text="Cancel"
      icon="ban"
      style="warning"
      onclick=${handleSwitch(returnTo)}
    ></button-single>

    <schema-form
      api="colors"
      json-path="$.properties.items.items"
      preset-paths="root.implement"
      data=${data}
      disable-paths="root.id"
      plain
      minimal
    ></schema-form>
  `;
  },
});
