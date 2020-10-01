/**
 * @file Colorset Editor: view colors element definition.
 */
import { handleSwitch } from './pane-utils.mjs';
import { html } from '/modules/hybrids.js';

export default styles => ({
  set: {},
  items: [],
  parentImplement: '', // Default parent level implement.
  name: '',
  description: '',

  render: ({
    items, name, description, parentImplement, set,
  }) => html`
    ${styles}
    <style>
      .item {
        position: relative;
        text-align: center;
        height: 64px;
        padding-top: 20px;
      }

      .item .icon {
        font-size: 4em;
      }

      .item .options {
        opacity: 0;
        transition: opacity 0.25s ease;
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .item:hover .options {
        opacity: 1;
      }
    </style>
    <button-single
      text="Edit Set"
      icon="edit"
      onclick=${handleSwitch('edit-set', { destProps: { data: set } })}
    ></button-single>
    <button-single
      text="Load Preset"
      icon="palette"
      onclick=${handleSwitch('presets')}
    ></button-single>
    <strong>${name}</strong>
    <h3>${description}</h3>
    <div>
    ${items.map(item => html`
      <div class="item">
        <tool-implement
          preset=${item.implement === '[inherit]' ? parentImplement : item.implement}
          scale="3",
          color=${item.color}
          plain
        ></tool-implement>
        <div class="options">
          <h3>${item.name}</h3>
          <button-single
            title="Edit"
            icon="edit"
            style="secondary"
            onclick=${handleSwitch('edit-color', { destProps: { data: item, parentImplement } })}
          ></button-single>
          <button-single
            title="Delete"
            icon="trash-alt"
            style="warning"
          ></button-single>
        </div>
      </div>
    `)}
    </div>

    <!--TODO: Add support for adding new colors. <button-single
      text="Add"
      icon="plus-circle"
      style="success"
      onclick=${handleSwitch('edit-color', { destProps: { data: {}, parentImplement } })}
    ></button-single>-->
  `,
});
