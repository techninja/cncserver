"use strict";

/**
 * @file Abstraction module for all settings related code for CNC Server!
 *
 */

module.exports = function(cncserver) {
  var nconf = require('nconf'); // Configuration and INI file.
  var fs = require('fs');       // File System management.
  var path = require('path');   // Path management and normalization.

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
  cncserver.settings.loadGlobalConfig = function(cb) {
    // Pull conf from file
    var configPath = path.resolve(__dirname, '..', 'config.ini');
    cncserver.gConf.reset();
    cncserver.gConf.use('file', {
      file: configPath,
      format: nconf.formats.ini
    }).load(function (){
      // Set Global Config Defaults
      cncserver.gConf.defaults(cncserver.globalConfigDefaults);

      // Save Global Conf file defaults if not saved
      if(!fs.existsSync(configPath)) {
        var def = cncserver.gConf.stores.defaults.store;
        for(var key in def) {
          if (key !== 'type'){
            cncserver.gConf.set(key, def[key]);
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
  cncserver.settings.loadBotConfig = function (cb, botType) {
    if (!botType) botType = cncserver.gConf.get('botType');

    var botFile = path.resolve(
      __dirname,
      '..',
      'machine_types',
      botType + '.ini'
    );

    if (!fs.existsSync(botFile)){
      console.error(
        'Bot configuration file "' +
        botFile +
        '" doesn\'t exist. Error #16'
      );

      process.exit(16);
    } else {
      cncserver.botConf.reset();
      cncserver.botConf.use('file', {
        file: botFile,
        format: nconf.formats.ini
      }).load(function(){

        // Mesh in bot overrides from main config
        var overrides = cncserver.gConf.get('botOverride');
        if (overrides) {
          if (overrides[botType]) {
            for(var key in overrides[botType]) {
              cncserver.botConf.set(key, overrides[botType][key]);
            }
          }
        }

        // Handy bot constant for easy number from string conversion
        cncserver.bot = {
          workArea: {
            left: Number(cncserver.botConf.get('workArea:left')),
            top: Number(cncserver.botConf.get('workArea:top')),
            right: Number(cncserver.botConf.get('maxArea:width')),
            bottom: Number(cncserver.botConf.get('maxArea:height'))
          },
          maxArea: {
            width: Number(cncserver.botConf.get('maxArea:width')),
            height: Number(cncserver.botConf.get('maxArea:height'))
          },
          park: {
            x: Number(cncserver.botConf.get('park:x')),
            y: Number(cncserver.botConf.get('park:y'))
          },
          commands : cncserver.botConf.get('controller').commands
        };

        // Check if a point is within the work area.
        cncserver.bot.inWorkArea = function(point) {
          var area = cncserver.bot.workArea;
          if (point.x > area.right || point.x < area.left) {
            return false;
          }
          if (point.y > area.bottom || point.y < area.top) {
            return false;
          }
          return true;
        };

        // Store assumed constants.
        var bot = cncserver.bot;
        bot.workArea.width = bot.maxArea.width - bot.workArea.left;
        bot.workArea.height = bot.maxArea.height - bot.workArea.top;

        bot.workArea.relCenter = {
          x: bot.workArea.width / 2,
          y: bot.workArea.height / 2
        };

        bot.workArea.absCenter = {
          x: bot.workArea.relCenter.x + bot.workArea.left,
          y: bot.workArea.relCenter.y + bot.workArea.top
        };

        // Set initial pen position at park position
        var park = cncserver.utils.centToSteps(bot.park, true);
        cncserver.pen.x = park.x;
        cncserver.pen.y = park.y;

        // Set global override for swapMotors if set by bot config
        var swapMotors = cncserver.botConf.get('controller:swapMotors');
        if (typeof swapMotors !== 'undefined') {
          cncserver.gConf.set('swapMotors', swapMotors);
        }

        console.log(
          'Successfully loaded config for ' +
          cncserver.botConf.get('name') +
          '! Initializing...'
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
  cncserver.settings.getSupportedBots = function() {
    var ini = require('ini');
    var list = fs.readdirSync(path.resolve(__dirname, '..', 'machine_types'));
    var out = {};
    for(var i in list) {
      var file = path.resolve(__dirname, '..', 'machine_types', list[i]);
      var data = ini.parse(fs.readFileSync(file, 'utf-8'), 'utf-8');
      var type = list[i].split('.')[0];
      out[type] = {
        name: data.name,
        data: data
      };
    }
    return out;
  };

  // Exports.
  cncserver.exports.getSupportedBots = cncserver.settings.getSupportedBots;
  cncserver.exports.loadGlobalConfig = cncserver.settings.loadGlobalConfig;
  cncserver.exports.loadBotConfig = cncserver.settings.loadBotConfig;
};
