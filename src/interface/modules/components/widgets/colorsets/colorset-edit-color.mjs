/**
 * @file Colorset Editor: edit single color element definition.
 */
/* globals cncserver, chroma, document */
import { html } from '/modules/hybrids.js';
import { handleSwitch } from './pane-utils.mjs';
import dataDiff from '/modules/utils/data-diff.mjs';
import * as matcher from '/modules/utils/colorset-matcher.mjs';
import { colorset, project } from '/modules/utils/live-state.mjs';

/**
 * Add current state as new color.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 */
function addDone(host) {
  // TODO: Add validation with user interaction.
  clearPreview();
  cncserver.api.colors.add(dataDiff(host.form.editor.data.current)).then(() => {
    handleSwitch(host.returnTo, { reload: true })(host);
  });
}

/**
 * Save current state back for existing color.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 */
function saveDone(host) {
  clearPreview();
  cncserver.api.colors.save(dataDiff(host.form.editor.data.current)).then(() => {
    handleSwitch(host.returnTo, { reload: true })(host);
  });
}

/**
 * Loop through all top level content items on the stage.
 *
 * @param {Function} itr
 *   Iterator function passed to map.
 *
 * @returns {object}
 *   Map return array.
 */
function mapStageItems(itr) {
  const items = document
    .querySelector('canvas-compose')
    .canvas
    .scope
    .project
    .layers
    .stage
    .children[0]
    .children
    .content
    .children;
  return items.map(itr);
}

/**
 * Undo any preview level customizations to the stage layer.
 */
function clearPreview() {
  mapStageItems(item => {
    if (item.strokeColor && item.data.startOpacity) {
      item.opacity = item.data.startOpacity;
    }
  });
}

/**
 * Preview current color items that will be selected.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 * @param {object} [overrides={}]
 *   Flat keyed object of values to inject for override.
 */
function previewChange(host, overrides = {}) {
  // Mesh in the item being edited.
  const hostData = { ...host.form.editor.data.current, ...overrides };
  matcher.setup({
    chroma, colorset, overrideItem: hostData, options: project.options,
  });

  mapStageItems(item => {
    if (item.strokeColor) {
      if (!item.data.startOpacity) {
        item.data.startOpacity = item.opacity;
      } else {
        item.opacity = item.data.startOpacity;
      }

      // const itemColor = item.strokeColor.toCSS(true);
      const matchKey = matcher.matchItemToColor(item);
      if (hostData.id === matchKey) {
        item.opacity = 1;
      } else {
        item.opacity = 0.1;
      }
    }
  });
}

/**
 * Catch Ranged input value change and send that over for preview changes.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 * @param {Event} event
 *   Event object from input.
 */
function onRangeInput(host, event) {
  const override = {};
  override[event.detail.name] = event.detail.value;
  previewChange(host, override);
}

/**
 * Focus event callback for the form.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 * @param {Event} event
 *   Event object from input.
 */
function onFocus(host) {
  previewChange(host);
}

/**
 * Blur event callback for the form.
 *
 * @param {Hybrids} host
 *   Hybrids DOM root.
 * @param {Event} event
 *   Event object from input.
 */
function onBlur(host) {
  clearPreview(host);
}

export default styles => ({
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
      onclick=${isNew ? addDone : saveDone}
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
      onrangeinput=${onRangeInput}
      onchange=${onFocus}
      onfocus=${onFocus}
      onblur=${onBlur}
      preset-paths="root.implement"
      data=${data}
      disablePaths=${isNew ? '' : 'root.id'}
      arrays
      plain
      minimal
    ></schema-form>
  `;
  },
});
