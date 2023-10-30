/**
 * @file CNCServer ReSTful API endpoint module for direct serial execution.
 */
import { getSerialValueRaw } from 'cs/ipc';

export const handlers = {};

handlers['/v2/serial'] = function serialMain(req, res) {
  if (req.route.method === 'post') {
    console.log('GOT SERIAL', req.body);
    getSerialValueRaw(req.body.command).then(message => {
      res.status(200).send(message);
    });
    return true; // Tell endpoint wrapper we'll handle the response
  }

  // Error to client for unsupported request types.
  return false;
};
