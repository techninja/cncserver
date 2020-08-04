/**
 * @file Colorset Editor: view colors element definition.
 */
import { handleSwitch } from './pane-utils.mjs';
import { html } from '/modules/hybrids.js';

// TODO:
// - Use Schema form to build out the rest of the controls here.
// - Figure out some way to manage what the back button does based on how it was switched to.
// - Figure out some way to get data into the forms when you land there
// - Build a new slide for tool management
// - Build a preset loader (including getting back to custom ones).
// - Customize the implement form and add a display for brush/pen visualization.
// - Finish building the custom colorset saver.
// - Fix the incredibly ugly padding issue. General styles?
export default styles => ({
  colors: [],
  implement: {}, // Parent level implement.
  set: {},
  name: '',
  description: '',

  render: ({
    colors, name, description, implement, set,
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
    <h2>${name}</h2>
    <h3>${description}</h3>
    <div>
      ${colors.map(color => html`
        <div class="item">
          <span class="icon" style=${{ color: color.color }}>
            <i class="fas fa-${color.type === 'pen' ? 'pen' : 'splotch'}" aria-hidden="true"></i>
          </span>
          <div class="options">
            <h3>${color.name}</h3>
            <button-single
              title="Edit"
              icon="edit"
              style="secondary"
              onclick=${handleSwitch('edit-color', { destProps: { data: color, implement } })}
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
    <button-single
      text="Add"
      icon="plus-circle"
      style="success"
      onclick=${handleSwitch('edit-color')}
    ></button-single>
  `,
});
