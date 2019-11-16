/**
 * @file Holds interface controller stuff for the gui.
 */
/* eslint-env browser */
/* globals cncserver, $, paper, cstate, utils */

const main = {};

main.initPaper = () => {
  // Setup live display box, pull in the bot specific settings
  cncserver.api.settings.bot().then((response) => {
    const { data: bot } = response;

    cstate.botName = bot.name;

    // Set subtitle text.
    cncserver.api.settings.global().then((global) => {
      $('.hero-body p.subtitle').text(
        `Controlling ${bot.name} through ${global.data.serialPath} on ${cncserver.api.server.domain}.`
      );
    });

    cstate.stepsPerMM = {
      x: bot.maxArea.width / bot.maxAreaMM.width,
      y: bot.maxArea.height / bot.maxAreaMM.height,
    };

    // Set the view scale and setup paper to be 1:1 mm with bot.
    paper.setup($('#paper')[0]);

    // The scale to adjust for pixel to MM offset.
    const viewScale = 3;
    paper.project.view.viewSize = [
      bot.maxAreaMM.width * viewScale,
      bot.maxAreaMM.height * viewScale,
    ];
    // TODO: why are these offsts needed?
    paper.project.view.center = [
      (bot.maxAreaMM.width / viewScale) + (bot.maxAreaMM.width / 6),
      (bot.maxAreaMM.height / viewScale) + (bot.maxAreaMM.height / 6),
    ];
    paper.project.view.scaling = [viewScale, viewScale];

    // Setup 4 layers: Drawing, moving, preview, and overlay.
    cstate.layers.drawing = new paper.Layer([]);
    cstate.layers.drawGroup = new paper.Group();

    cstate.layers.moving = new paper.Layer([]);
    cstate.layers.moveGroup = new paper.Group();

    cstate.layers.preview = new paper.Layer([]);
    if (cstate.tempPreview) cstate.layers.preview.importJSON(cstate.tempPreview);

    cstate.layers.overlay = new paper.Layer([]);


    // Setup workarea (on active overlay layer)
    cstate.workarea = new paper.Path.Rectangle({
      point: [
        bot.workArea.left / cstate.stepsPerMM.x,
        bot.workArea.top / cstate.stepsPerMM.y,
      ],
      size: [
        bot.maxAreaMM.width,
        bot.maxAreaMM.height,
      ],
    });
    cstate.workarea.strokeWidth = 2;
    cstate.workarea.strokeColor = 'red';


    // Make crosshair (on active overlay layer).
    const size = 15 / viewScale;
    cstate.crosshair = new paper.Group([
      new paper.Shape.Circle([0, 0], size),
      new paper.Path.Line([-size * 1.5, 0], [-size / 5, 0]),
      new paper.Path.Line([size * 1.5, 0], [size / 5, 0]),
      new paper.Path.Line([0, -size * 1.5], [0, -size / 5]),
      new paper.Path.Line([0, size * 1.5], [0, size / 5]),
    ]);
    cstate.crosshair.strokeColor = 'black';
    cstate.crosshair.strokeWidth = size / 5;

    cstate.crosshairTip = cstate.crosshair.clone();
    cstate.crosshairTip.strokeColor = 'green';
    cstate.crosshairTip.strokeWidth = size / 2;
    cstate.crosshairTip.sendToBack();

    // Setup the canvas click.
    paper.project.view.onMouseDown = (event) => {
      cncserver.api.pen.move(
        utils.paperToMove([event.point.x, event.point.y])
      );
    };

    // Setup the height option buttons for the bot
    Object.keys(bot.servo.presets).forEach((presetName) => {
      $('#heightbuttons').append(
        $('<button>').text(presetName).click(() => {
          cncserver.api.pen.height(presetName, null, {
            skipBuffer: $('#skipbufferz').prop('checked') ? 1 : '',
          });
        })
      );
    });

    // Initially set the pen from the bot
    cncserver.api.pen.stat().then((res) => {
      cstate.pen = res.data;
      cstate.lastPen = $.extend({}, res.data);
      // This is always the correct tip of the buffer.
      cstate.crosshairTip.position = utils.stepsToPaper(cstate.pen);

      // Assume this is also where the bot is (idle, no buffer).
      cstate.crosshair.position = utils.stepsToPaper(cstate.pen);
    });

    // Let the canvas resize within its space.
    const $canvas = $('#paper');
    const $wrapper = $('#canvas-wrapper');
    $(window).resize(() => {
      const scale = $wrapper.width() / $canvas.width();
      $canvas.css('transform', `scale(${scale})`);
      $wrapper.css('height', $canvas.height() * scale);
    }).resize();
  });
};

// Populate tool buttons
main.initTools = () => {
  // Manage control tabs.
  $('.tabs li').on('click', function tabClick() {
    const $item = $(this);
    const $content = $item.parents('.tabs').next();
    const tab = $item.data('tab');

    $item.siblings('li').removeClass('is-active');
    $item.addClass('is-active');

    $content.find('.tab-content').removeClass('is-active');
    $(`.tab-content[data-content="${tab}"]`).addClass('is-active');
  });

  // Get the list of tools and output them.
  cncserver.api.tools.list().then((response) => {
    if (response.data) {
      $('#tools h4').remove();
      const toolGroups = {};
      response.data.tools.forEach((tool) => {
        const td = response.data.toolData[tool];
        const group = td.group || 'none';

        if (!toolGroups[group]) {
          toolGroups[group] = [];
        }

        toolGroups[group].push(tool);
      });

      Object.keys(toolGroups).forEach((group) => {
        const $buttons = $('<div>').addClass('buttons');

        toolGroups[group].forEach((tool) => {
          $('<p>')
            .addClass('control')
            .append(
              $('<button>')
                .text(tool)
                .addClass('button is-info is-small')
            )
            .appendTo($buttons);
        });

        if (group === 'none') {
          $('#tools').append($buttons);
        } else {
          $('#tools').append(
            $('<details>')
              .addClass('box')
              .append(
                $('<summary>')
                  .addClass('label')
                  .text(group),
                $buttons
              )
          );
        }
      });

      $('#tools button').click(function buttonClick() {
        cncserver.api.tools.change($(this).text());
      });
    } else {
      $('#tools h4').text('Failed to load tools :(');
    }
  });
};

main.bindClick = (selector, callbacks) => {
  $(selector).click(function click(e) {
    const { id } = this;
    if (callbacks[id]) callbacks[id](e);
  });
};

export default main;
