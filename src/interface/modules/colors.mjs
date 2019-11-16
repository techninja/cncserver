/**
 * @file Holds interface controller stuff for the color management gui.
 */
/* eslint-env browser */
/* globals cncserver, $, paper, cstate, utils */

const colors = {};
const colorSuggestions = [];

colors.initPresets = (selector) => {
  cncserver.api.colors.stat().then(({ data }) => {
    const $select = $(selector);

    const options = [];
    const colorFilter = {};
    Object.entries(data.presets).forEach(([name, preset]) => {
      options.push({ id: name, text: `${preset.manufacturer} ${preset.machineName}` });
      // Move through all colors in all presets and add as suggestions.
      Object.entries(preset.colors).forEach(([name, color]) => {
        colorFilter[color.toUpperCase()] = name;
      });
    });

    // Convert the color key based colorFilter to a select 2 option array.
    Object.entries(colorFilter).forEach(([color, id]) => {
      colorSuggestions.push({ id, color, text: id });
    });

    // Sort color suggestions by name.
    colorSuggestions.sort((a, b) => {
      let comparison = 0;
      if (a.text > b.text) {
        comparison = 1;
      } else if (a.text < b.text) {
        comparison = -1;
      }
      return comparison;
    });

    const renderColors = (id) => {
      const preset = data.presets[id];
      const $container = $('<span>').addClass('colors');
      Object.entries(preset.colors).forEach(([title, backgroundColor]) => {
        $container.append(
          $('<b>').attr({ title }).css({ backgroundColor })
        );
      });
      return $container[0].outerHTML;
    };

    const templatePreset = (option) => {
      if (option.id) {
        const icon = data.presets[option.id].media === 'pen' ? 'pen' : 'paint-brush';
        return `<span class="preset"><i class="fas fa-lg fa-${icon}"></i>${option.text} -- ${renderColors(option.id)}</span>`;
      }
      return option.text;
    };


    $select.select2({
      placeholder: 'Select a colorset preset',
      data: options,
      escapeMarkup: m => m,
      templateSelection: templatePreset,
      templateResult: templatePreset,
      width: '100%',
    }).on('select2:select', ({ params: { data: { id, text } } }) => {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Replace current colorset with "${text}"?`)) {
        cncserver.api.colors.preset(id).then(() => {
          colors.refreshColorset();
        });
      } else {
        $select.val('').change();
      }
    });
  });
};

// Force a rebuild/update of the colorset display
colors.refreshColorset = () => new Promise((ok) => {
  const $wrapper = $('#colorset div.list');
  cstate.colorset = {};
  cncserver.api.colors.stat().then(({ data: { set } }) => {
    $wrapper.empty();
    set.forEach(({ id, name, color }) => {
      cstate.colorset[id] = name;

      $wrapper.append(
        $('<div>').attr({ id: `color-${id}`, title: 'Edit this Color' }).addClass('card').append(
          $('<header>').addClass('card-header').append(
            $('<b>').css('background-color', color).text(id),
            $('<p>').addClass('card-header-title').text(name),
            $('<a>')
              .addClass('card-header-icon')
              .attr('title', 'Delete this color')
              .click((e) => { e.stopPropagation(); e.preventDefault(); colors.deleteColor(id, name); })
              .append($('<span class="icon is-danger"><i class="fas fa-times-circle" aria-hidden="true"></i></span>'))
          )
        )
          .click(() => { colors.loadColor({ id, name, color }); })
      );
    });
    ok();
  });
});

colors.deleteColor = (id, name) => {
  // eslint-disable-next-line no-alert
  if (window.confirm(`Delete Color: ${id} - "${name}"?`)) {
    $(`#color-${id}`).slideUp(500, () => {
      cncserver.api.colors.delete(id).then(() => {
        colors.refreshColorset();
      });
    });
  }
};

colors.loadColor = ({ id, name, color }) => {
  $(`#color-${id}`).val(id);
  $('#colorset input.id').val(id).change();
  $('#colorset input.name').val(name);
  $('#colorset input.color').val(color);
};

colors.validateSave = () => {
  $('#colorset input.is-danger').removeClass('is-danger');

  if (!$('#colorset input.id').val()) {
    $('#colorset input.id')
      .addClass('is-danger')
      .focus();
    return false;
  }

  if (!$('#colorset input.name').val()) {
    $('#colorset input.name')
      .addClass('is-danger')
      .focus();
    return false;
  }

  return true;
};

colors.initColorManager = (selector) => {
  const $wrapper = $(selector);

  // Trigger editor loaded item to matching set id.
  $wrapper.find('input.id').on('change input', (e) => {
    const val = $wrapper.find('input.id').val().trim();
    $wrapper.find('.card').removeClass('active');

    // Editing, or adding?
    if ($(`#color-${val}`).length) {
      $(`#color-${val}`).addClass('active');
      $('#color-add').addClass('is-hidden');
      $('#color-save').removeClass('is-hidden');
    } else {
      $('#color-save').addClass('is-hidden');
      $('#color-add').removeClass('is-hidden');
    }
  });

  // Cancel, Add or save binds
  $('#color-cancel').click(() => {
    $('#colorset input.id').val('').change();
    $('#colorset input.name').val('');
    $('#colorset input.color').val('#000000');
    $('#colorset input.is-danger').removeClass('is-danger');
    $wrapper.find('select').val('').change();
  });

  $('#color-add, #color-save').click((e) => {
    const action = e.currentTarget.id.split('-')[1];
    if (colors.validateSave()) {
      cncserver.api.colors[action]({
        id: $('#colorset input.id').val(),
        color: $('#colorset input.color').val(),
        name: $('#colorset input.name').val(),
      }).then(() => {
        colors.refreshColorset().then(() => {
          $('#color-cancel').click();
        });
      });
    }
  });

  colors.refreshColorset().then(() => {
    // Render Select 2 for color presets for adding colors.
    const templatePreset = (option) => {
      if (option.id) {
        const swatch = `<b style="background-color: ${option.color}"></b>`;
        const header = '<span class="preset-color">';
        return `${header}${swatch}${option.text}</span>`;
      }
      return option.text;
    };

    $wrapper.find('select').select2({
      placeholder: 'Pick a Color',
      data: colorSuggestions,
      escapeMarkup: m => m,
      templateSelection: templatePreset,
      templateResult: templatePreset,
      width: '100%',
    }).on('select2:select', ({ params: { data } }) => {
      $wrapper.find('input.color').val(data.color);
      $wrapper.find('input.name').val(data.text);
    });
  });
};

export default colors;
