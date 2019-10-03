/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v1/pen'] = function penMain(req, res) {
    if (req.route.method === 'put') {
      // Verify absolute measurement input.
      if (req.body.abs) {
        if (!['in', 'mm'].includes(req.body.abs)) {
          return [
            406,
            'Input not acceptable, absolute measurement must be: in, mm',
          ];
        }

        if (!cncserver.settings.bot.maxAreaMM) {
          return [
            406,
            'Input not acceptable, bot does not support absolute position.',
          ];
        }
      }

      // SET/UPDATE pen status
      cncserver.pen.setPen(req.body, (stat) => {
        let code = 202;
        let body = {};

        if (!stat) {
          code = 500;
          body.status = 'Error setting pen!';
        } else {
          // Wait return.
          if (req.body.waitForCompletion) {
            code = 200;
          }
          body = cncserver.pen.state;
        }

        body = JSON.stringify(body);
        res.status(code).send(body);

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, code, body);
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    }

    if (req.route.method === 'delete') {
      // Reset pen to defaults (park)
      cncserver.pen.park(req.body.skipBuffer, (stat) => {
        let code = 200;
        let body = {};

        if (!stat) {
          code = 500;
          body.status = 'Error parking pen!';
        } else {
          body = cncserver.pen.state;
        }

        body = JSON.stringify(body);
        res.status(code).send(body);

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, code, body);
        }
      });

      return true; // Tell endpoint wrapper we'll handle the response
    }

    if (req.route.method === 'get') {
      if (req.query.actual) {
        return { code: 200, body: cncserver.actualPen.state };
      }

      return { code: 200, body: cncserver.pen.state };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
