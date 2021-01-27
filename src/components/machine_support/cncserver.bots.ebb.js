/**
 * @file Abstraction module for EiBotBoard specific support.
 * @see http://evil-mad.github.io/EggBot/ebb.html
 */
import semver from 'semver';
import { bindTo } from 'cs/binder';
import run from 'cs/run';
import { setSetupCommands } from 'cs/serial';
import { cmdstr } from 'cs/buffer';
import { botConf } from 'cs/settings';
import { getSerialValue } from 'cs/ipc';
import { singleLineString as SLS } from 'cs/utils';

const ebb = { id: 'bots.ebb', version: {} }; // Exposed export.
const minVersion = '>=2.2.7';
let controller = {}; // Placeholder for machine config export.

/**
 * Initialize bot specific code.
 *
 * @export
 */
export default function initBot() {
  // Bot support in use parent callback.
  ebb.checkInUse = botConfig => {
    ebb.inUse = botConfig.controller.name === 'EiBotBoard';
  };

  // Bind EBB support on controller setup -before- serial connection.
  bindTo('controller.setup', ebb.id, controllerConfig => {
    if (controllerConfig.name === 'EiBotBoard') {
      setSetupCommands([
        // Set motor precision.
        cmdstr('enablemotors', { p: botConf.get('speed:precision') }),
      ]);
    }
  });

  // Bind to serial connection.
  bindTo('serial.connected', ebb.id, () => {
    // Exit early if we've already done this (happens on reconnects).
    if (ebb.version.value) {
      return;
    }

    controller = botConf.get('controller');

    // Get EBB version.
    getSerialValue('version').then(message => {
      if (message.includes(controller.error)) {
        console.error('='.repeat(76));
        console.error('Failed to load version information! Message given:');
        console.error(`"${message}"`);
        console.error('Please restart CNC Server to ensure correct operation.');
        console.error('='.repeat(76));
        return;
      }

      const version = message.split(' ').pop();
      ebb.version = {
        value: version,
        string: message,
      };
      console.log(
        SLS`Connected to ${controller.manufacturer} ${controller.name},
          firmware v${version}`
      );
      if (!semver.satisfies(version, minVersion)) {
        console.error('='.repeat(76));
        console.error(SLS`ERROR: Firmware version does not meet minimum
          requirements (${minVersion})`);
        console.error(SLS`To upgrade, see:
          https://wiki.evilmadscientist.com/Updating_EBB_firmware`);
        console.error('='.repeat(76));
      }
    });
  });

  // Bind to general controller message returns.
  bindTo('serial.message', ebb.id, message => {
    // If this isn't an acknowledgement of a working command...
    if (message !== controller.ack) {
      if (message.includes(controller.error)) {
        console.error('Error from EBB:', message);
      }
    }
  });

  /* // Bind to buffer clear to emergency stop.
  // TODO: This does not work, but it SHOULD. During moves, we need to find out
  // how far we failed to go before it stopped, which IS reported, but I suspect
  // these are RAW motor steps before X/Y (XM) moves, so this doesn't work for
  // AxiDraw or anything else that doesn't use standard direct X/Y moves.
  // Likely what needs to happen here is we do the conversion ourselves.
  cncserver.binder.bindTo('buffer.clear', ebb.id, () => {
    cncserver.ipc.getSerialValue('estop').then((message) => {
      // @see: http://evil-mad.github.io/EggBot/ebb.html#ES
      const data = message.split(',');

      // Only if the motors were moving should we fix the position.
      if (data[0] === '1') {
        const offset = { x: parseInt(data[3], 10), y: parseInt(data[4], 10) };
        console.log(data);
        console.log(offset);
        const ap = cncserver.actualPen;
        console.log(ap.state);
        const force = {
          x: ap.state.x + (offset.x + offset.y),
          y: ap.state.y + (offset.y - offset.x),
          lastDuration: 0,
        };

        console.log(force);

        cncserver.pen.forceState(force);
        ap.forceState(force);

        // console.dir(ap.state);
      }
    });
  });
  //* /

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
    run('custom', `SC,${id},${value}`);
  };

  return ebb;
}
