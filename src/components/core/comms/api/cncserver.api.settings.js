/**
 * @file CNCServer ReSTful API endpoint module for settings management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v2/settings'] = function settingsGet(req) {
    if (req.route.method === 'get') { // Get list of tools
      return {
        code: 200,
        body: {
          global: '/v2/settings/global',
          bot: '/v2/settings/bot',
        },
      };
    }

    return false;
  };

  handlers['/v2/settings/:type'] = function settingsMain(req) {
    // TODO: Refactor most/all of this to be more consistent, and pull useful
    // cleaned up config from cnccserver.settings.[x]

    // Sanity check type
    const setType = req.params.type;
    if (!['global', 'bot'].includes(setType)) {
      return [404, 'Settings group not found'];
    }

    let conf = cncserver.settings.botConf;
    if (setType === 'global') {
      conf = cncserver.settings.gConf;
    }

    function getSettings() {
      let out = {};
      // Clean the output for global as it contains all commandline env vars!
      if (setType === 'global') {
        const g = conf.get();
        for (const [key, value] of Object.entries(g)) {
          if (key === 'botOverride') {
            break;
          }
          out[key] = value;
        }
      } else {
        out = conf.get();
      }
      return out;
    }

    // Get the full list for the type
    if (req.route.method === 'get') {
      return { code: 200, body: getSettings() };
    }
    if (req.route.method === 'put') {
      for (const [key, value] of Object.entries(req.body)) {
        conf.set(key, value);
      }

      console.log((req.body.debug != undefined || req.body.showSerial != undefined))

      // Send updated setting to the runner when changed
      if (setType === 'global' && (req.body.debug != undefined || req.body.showSerial != undefined)){
        cncserver.ipc.sendMessage('runner.config', {
          debug: req.body.debug,
          showSerial: req.body.showSerial
        });
      }else if (setType === 'bot' && (req.body.controller != undefined )){
        cncserver.ipc.sendMessage('runner.config', {
          controller: req.body.controller,
        });
      }
      return { code: 200, body: getSettings() };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
