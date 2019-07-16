/**
 * @file Abstraction module for all settings related code for CNC Server!
 *
 */
const nconf = require('nconf'); // Configuration and INI file.
const fs = require('fs'); // File System management.
const path = require('path'); // Path management and normalization.
const ini = require('ini'); // Reading INI files.

module.exports = (cncserver) => {
  cncserver.gConf = new nconf.Provider();
  cncserver.botConf= new nconf.Provider();
  cncserver.bot = {};

  // Pull conf from env, or arguments
  cncserver.gConf.env().argv();

  cncserver.settings = {};

  /**
   * Initialize/load the global cncserver configuration file & options.
   *
   * @param {function} cb
   *   Optional callback triggered when complete.
   */
  cncserver.settings.loadGlobalConfig = (cb) => {
    // Pull conf from file
    const configPath = path.resolve(__dirname, '..', 'config.ini');
    cncserver.gConf.reset();
    cncserver.gConf.use('file', {
      file: configPath,
      format: nconf.formats.ini,
    }).load(() => {
      // Set Global Config Defaults
      cncserver.gConf.defaults(cncserver.globalConfigDefaults);

      // Save Global Conf file defaults if not saved
      if (!fs.existsSync(configPath)) {
        const def = cncserver.gConf.stores.defaults.store;
        for (const [key, value] in Object.entries(def)) {
          if (key !== 'type') {
            cncserver.gConf.set(key, value);
          }
        }

        // Should be sync/blocking save with no callback
        cncserver.gConf.save();
      }

      if (cb) cb(); // Trigger the callback

      // Output if debug mode is on
      if (cncserver.gConf.get('debug')) {
        console.info('== CNCServer Debug mode is ON ==');
      }
    });
  };

  /**
   * Load bot specific config file
   *
   * @param {function} cb
   *   Callback triggered when loading is complete
   * @param {string} botType
   *   Optional, the machine name for the bot type to load. Defaults to the
   *   globally configured bot type.
   */
  cncserver.settings.loadBotConfig = (cb, botType = cncserver.gConf.get('botType')) => {
    const botFile = path.resolve(
      __dirname,
      '..',
      'machine_types',
      `${botType}.ini`
    );

    if (!fs.existsSync(botFile)) {
      console.error(
        `Bot configuration file "${botFile}" doesn't exist. Error #16`
      );

      process.exit(16);
    } else {
      cncserver.botConf.reset();
      cncserver.botConf
        .use('file', {
          file: botFile,
          format: nconf.formats.ini,
        })
        .load(() => {
          // Mesh in bot overrides from main config
          const overrides = cncserver.gConf.get('botOverride');
          if (overrides) {
            if (overrides[botType]) {
              for (const [key, value] of Object.entries(overrides[botType])) {
                cncserver.botConf.set(key, value);
              }
            }
          }

          // Handy bot constant for easy number from string conversion
          cncserver.bot = {
            workArea: {
              left: Number(cncserver.botConf.get('workArea:left')),
              top: Number(cncserver.botConf.get('workArea:top')),
              right: Number(cncserver.botConf.get('maxArea:width')),
              bottom: Number(cncserver.botConf.get('maxArea:height')),
            },
            maxArea: {
              width: Number(cncserver.botConf.get('maxArea:width')),
              height: Number(cncserver.botConf.get('maxArea:height')),
            },
            maxAreaMM: {
              width: Number(cncserver.botConf.get('maxAreaMM:width')),
              height: Number(cncserver.botConf.get('maxAreaMM:height')),
            },
            park: {
              x: Number(cncserver.botConf.get('park:x')),
              y: Number(cncserver.botConf.get('park:y')),
            },
            commands: cncserver.botConf.get('controller').commands,
          };

          // Check if a point is within the work area.
          cncserver.bot.inWorkArea = ({ x, y }) => {
            const area = cncserver.bot.workArea;
            if (x > area.right || x < area.left) {
              return false;
            }
            if (y > area.bottom || y < area.top) {
              return false;
            }
            return true;
          };

          // Store assumed constants.
          const { bot } = cncserver;
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
            //bot.stepsPerMM
          } else {
            cncserver.bot.maxAreaMM = false;
          }

          // Set initial pen position at park position
          const park = cncserver.utils.centToSteps(bot.park, true);
          cncserver.pen.x = park.x;
          cncserver.pen.y = park.y;

          // Set global override for swapMotors if set by bot config
          const swapMotors = cncserver.botConf.get('controller:swapMotors');
          if (typeof swapMotors !== 'undefined') {
            cncserver.gConf.set('swapMotors', swapMotors);
          }

          console.log(
            `Successfully loaded config for ${cncserver.botConf.get(
              'name'
            )}! Initializing...`
          );

          // Trigger the callback once we're done
          if (cb) cb();
        });
    }
  };

  /**
   * Get the list of supported bots and their full ini config arrays.
   *
   * @return {object}
   *   A keyed array/object of all supported bot configurations and data.
   */
  cncserver.settings.getSupportedBots = () => {
    const list = fs.readdirSync(path.resolve(__dirname, '..', 'machine_types'));
    const out = {};
    for (const i of list) {
      const file = path.resolve(__dirname, '..', 'machine_types', list[i]);
      const data = ini.parse(fs.readFileSync(file, 'utf-8'), 'utf-8');
      const type = list[i].split('.')[0];
      out[type] = {
        name: data.name,
        data,
      };
    }
    return out;
  };

  // Exports.
  cncserver.exports.getSupportedBots = cncserver.settings.getSupportedBots;
  cncserver.exports.loadGlobalConfig = cncserver.settings.loadGlobalConfig;
  cncserver.exports.loadBotConfig = cncserver.settings.loadBotConfig;
};
