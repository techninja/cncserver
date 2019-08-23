/**
 * @file Abstraction module for EiBotBoard specific support.
 * @see http://evil-mad.github.io/EggBot/ebb.html
 */
const ebb = { id: 'ebb' }; // Exposed export.

module.exports = (cncserver) => {


  // Bind EBB support on controller setup before serial connection.
  cncserver.binder.bindTo('controller.setup', ebb.id, (controller) => {
    if (controller.name === 'EiBotBoard') {
      const rate = cncserver.settings.botConf.get('servo:rate');
      cncserver.serial.setSetupCommands([
        // Set motor precision.
        cncserver.buffer.cmdstr(
          'enablemotors',
          { p: cncserver.settings.botConf.get('speed:precision') }
        ),

        // TODO: This probably shouldn't be set twice.
        cncserver.buffer.cmdstr('configureservo', { r: rate }),
        cncserver.buffer.cmdstr('configureservo', { r: rate }),
      ]);
    }
  });


  /**
   * Run to the buffer direct low level setup commands (for EiBotBoard only).
   *
   * @param {integer} id
   *   Numeric ID of EBB setting to change the value of
   * @param {integer} value
   *   Value to set to
   */
  // TODO: Find/replace all instances of "serial.sendEBBSetup"
  ebb.sendSetup = (id, value) => {
    cncserver.run('custom', `SC,${id},${value}`);
  };

  return ebb;
};
