/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
import * as print from 'cs/print';

export const handlers = {};

// TODO:
// - GET /: List all prints for all projects
// - GET /[PROJECT HASH]: All prints for project
// - GET /[PROJECT HASH]/[PRINT_HASH]: All data for specific print
// - PUT /[PROJECT HASH]/[PRINT_HASH]: Edit only title, desc  for a print.
// - POST /[PROJECT-HASH] or /: Create print render with given settings.
// - DELETE /[PROJECT HASH]/[PRINT_HASH]: Delete a given print
handlers['/v2/print'] = function printMain(req) {
  if (req.route.method === 'get') {
    print.getPrintData();
    return [200, 'Check the file'];
  }

  // Error to client for unsupported request types.
  return false;
};
