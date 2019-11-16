/**
 * @file Holds button callbacks based on ID.
 */
/* eslint-env browser */
/* globals cncserver, $, paper, cstate */
const buttons = {};

buttons.cancel = () => { cncserver.api.buffer.clear(); };

buttons.unlock = () => {
  cncserver.api.motors.unlock().then(cncserver.api.pen.zero());
};

buttons.park = () => {
  cncserver.api.pen.park(null, {
    skipBuffer: $('#skipbuffer').prop('checked') ? 1 : '',
  }); // << Direct method
};

buttons.draw = () => {
  cncserver.api.actions.drawPreview();
};

buttons['toggle-buffer'] = (e) => {
  const $this = $(e.currentTarget);
  const $op = $this.find('option:hidden');

  $this.find('option').hide();
  $op.show();
  $this.removeClass('is-warning is-success');
  $this.addClass($op.attr('data-op') === 'pause' ? 'is-success' : 'is-warning');

  const $icon = $this.find('span.icon i');
  $icon.removeClass('fa-pause fa-play');
  $icon.addClass($op.attr('data-op') === 'pause' ? 'fa-play' : 'fa-pause');

  if ($op.attr('data-op') === 'resume') {
    cncserver.api.buffer.resume();
  } else {
    cncserver.api.buffer.pause();
  }
};

buttons['toggle-pen'] = (e) => {
  const $this = $(e.currentTarget);
  console.log('this', e);
  const $op = $this.find('option:hidden');

  $this.find('option').hide();
  $op.show();
  $this.removeClass('is-success is-link');
  $this.addClass($op.attr('data-op') === 'up' ? 'is-success' : 'is-link');

  cncserver.api.pen.height($op.attr('data-op'), null, {
    skipBuffer: $('#skipbuffer').prop('checked') ? 1 : '',
  });
};

export default buttons;
