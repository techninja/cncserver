/**
 * @file Abstraction module for all settings related code for CNC Server!
 *
 */
import nconf from 'nconf'; // Configuration and INI file.
import fs from 'fs'; // File System management.
import path from 'path'; // Path management and normalization.
import ini from 'ini'; // Reading INI files.

import { trigger } from 'cs/binder';
import { __basedir } from 'cs/utils';

// Export base constants.
export const gConf = new nconf.Provider();
export const botConf = new nconf.Provider();
export const bot = {};

// Global Defaults (also used to write the initial config.ini)
export const globalConfigDefaults = {
  httpPort: 4242,
  httpLocalOnly: true,
  swapMotors: false, // Global setting for bots that don't have it configured
  invertAxis: {
    x: false,
    y: false,
  },
  maximumBlockingCallStack: 100, // Limit for the # blocking sequential calls
  showSerial: false, // Specific debug to show serial data.
  serialPath: '{auto}', // Empty for auto-config
  bufferLatencyOffset: 30, // Number of ms to move each command closer together
  corsDomain: '*', // Start as open to CORs enabled browser clients
  debug: false,
  botType: 'watercolorbot',
  scratchSupport: true,
  flipZToggleBit: false,
  botOverride: {
    info: 'Override bot settings E.G. > [botOverride.eggbot] servo:max = 1234',
  },
};

// Pull conf from env, or arguments
gConf.env().argv();

/**
  * Initialize/load the global cncserver configuration file & options.
  *
  * @param {function} cb
  *   Optional callback triggered when complete.
  */
export function loadGlobalConfig(cb) {
  // Pull conf from file
  const configPath = path.resolve(__basedir, '..', 'config.ini');
  gConf.reset();
  gConf.use('file', {
    file: configPath,
    format: nconf.formats.ini,
  }).load(() => {
    // Set Global Config Defaults
    gConf.defaults(globalConfigDefaults);

    // Save Global Conf file defaults if not saved
    if (!fs.existsSync(configPath)) {
      const def = gConf.stores.defaults.store;
      for (const [key, value] in Object.entries(def)) {
        if (key !== 'type') {
          gConf.set(key, value);
        }
      }

      // Should be sync/blocking save with no callback
      gConf.save();
    }

    if (cb) cb(); // Trigger the callback

    // Output if debug mode is on
    if (gConf.get('debug')) {
      console.info('== CNCServer Debug mode is ON ==');
    }
  });
}

/**
  * Load bot specific config file
  *
  * @param {function} cb
  *   Callback triggered when loading is complete
  * @param {string} botType
  *   Optional, the machine name for the bot type to load. Defaults to the
  *   globally configured bot type.
  */
export function loadBotConfig(cb, botType = gConf.get('botType')) {
  const botFile = path.resolve(__basedir, '..', 'machine_types', `${botType}.ini`);

  if (!fs.existsSync(botFile)) {
    console.error(
      `Bot configuration file "${botFile}" doesn't exist. Error #16`
    );

    process.exit(16);
  } else {
    botConf.reset();
    botConf
      .use('file', {
        file: botFile,
        format: nconf.formats.ini,
      })
      .load(() => {
        // Mesh in bot overrides from main config
        const overrides = gConf.get('botOverride');
        if (overrides) {
          if (overrides[botType]) {
            for (const [key, value] of Object.entries(overrides[botType])) {
              botConf.set(key, value);
            }
          }
        }

        // Handy bot constant for easy number from string conversion
        bot.workArea = {
          left: Number(botConf.get('workArea:left')),
          top: Number(botConf.get('workArea:top')),
          right: Number(botConf.get('maxArea:width')),
          bottom: Number(botConf.get('maxArea:height')),
        };
        bot.maxArea = {
          width: Number(botConf.get('maxArea:width')),
          height: Number(botConf.get('maxArea:height')),
        };
        bot.maxAreaMM = {
          width: Number(botConf.get('maxAreaMM:width')),
          height: Number(botConf.get('maxAreaMM:height')),
        };
        bot.park = {
          x: Number(botConf.get('park:x')),
          y: Number(botConf.get('park:y')),
        };
        bot.controller = botConf.get('controller');
        bot.commands = botConf.get('controller').commands;

        // Check if a point is within the work area.
        bot.inWorkArea = ({ x, y }) => {
          const area = bot.workArea;
          if (x > area.right || x < area.left) {
            return false;
          }
          if (y > area.bottom || y < area.top) {
            return false;
          }
          return true;
        };

        // Store assumed constants.
        bot.workArea.width = bot.maxArea.width - bot.workArea.left;
        bot.workArea.height = bot.maxArea.height - bot.workArea.top;

        bot.workArea.relCenter = {
          x: bot.workArea.width / 2,
          y: bot.workArea.height / 2,
        };

        bot.workArea.absCenter = {
          x: bot.workArea.relCenter.x + bot.workArea.left,
          y: bot.workArea.relCenter.y + bot.workArea.top,
        };

        // If supplied, add conversions for abs distance.
        if (bot.maxAreaMM.width) {
          bot.stepsPerMM = {
            x: bot.maxArea.width / bot.maxAreaMM.width,
            y: bot.maxArea.height / bot.maxAreaMM.height,
          };

          bot.workAreaMM = {
            left: bot.workArea.left / bot.stepsPerMM.x,
            top: bot.workArea.top / bot.stepsPerMM.y,
            right: bot.workArea.right / bot.stepsPerMM.x,
            bottom: bot.workArea.bottom / bot.stepsPerMM.y,
          };
          //  bot.stepsPerMM
        } else {
          bot.maxAreaMM = false;
        }

        // Set global override for swapMotors if set by bot config
        const swapMotors = botConf.get('controller:swapMotors');
        if (typeof swapMotors !== 'undefined') {
          gConf.set('swapMotors', swapMotors);
        }

        // Trigger any bot/board specific setup.
        trigger('controller.setup', botConf.get('controller'), true);

        console.log(
          `Successfully loaded config for ${botConf.get(
            'name'
          )}! Initializing...`
        );

        // Trigger the callback once we're done
        if (cb) cb();
      });
  }
}

/**
  * Get the list of supported bots and their full ini config arrays.
  *
  * @return {object}
  *   A keyed array/object of all supported bot configurations and data.
  */
export function getSupportedBots() {
  const list = fs.readdirSync(path.resolve(__basedir, '..', 'machine_types'));
  const out = {};
  for (const i of list) {
    const file = path.resolve(__basedir, '..', 'machine_types', list[i]);
    const data = ini.parse(fs.readFileSync(file, 'utf-8'), 'utf-8');
    const type = list[i].split('.')[0];
    out[type] = {
      name: data.name,
      data,
    };
  }
  return out;
}
