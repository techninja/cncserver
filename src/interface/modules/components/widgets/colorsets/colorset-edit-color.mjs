/**
 * @file Colorset Editor: edit single color element definition.
 */
/* globals cncserver */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';
import dataDiff from '/modules/utils/data-diff.mjs';

function addDone(host) {
  // TODO: Add validation with user interaction.
  cncserver.api.colors.add(dataDiff(host.form.editor.data.current)).then(() => {
    handleSwitch(host.returnTo, { reload: true })(host);
  });
}

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

    const isNew = !(data && data.id);
    return html`
    ${styles}
    <button-single
      text=${isNew ? 'Add' : 'Save'}
      icon=${isNew ? 'plus-square' : 'save'}
      type=${isNew ? 'info' : 'success'}
      onclick=${isNew ? addDone : saveDone }
    ></button-single>
    <button-single
      text="Cancel"
      icon="ban"
      type="warning"
      onclick=${handleSwitch(returnTo)}
    ></button-single>
    <schema-form
      api="colors"
      json-path="$.properties.items.items"
      preset-paths="root.implement"
      data=${data}
      disablePaths=${isNew ? '' : 'root.id'}
      plain
      minimal
    ></schema-form>
  `;
  },
});
