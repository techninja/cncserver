/**
 * @file CNCServer ReSTful API endpoint module for implement management.
 */
import {
  listPresets,
  customKeys,
  internalKeys,
  edit,
  get,
  add,
  deleteImplement,
  IMPLEMENT_PARENT
} from 'cs/drawing/implements';
import { colors } from 'cs/drawing';
import { validateData } from 'cs/schemas';
import { singleLineString, merge } from 'cs/utils';
import { err } from 'cs/rest';

export const handlers = {};

// Primary group handler.
handlers['/v2/implements'] = (req, res) => {
  // Standard post resolve for colors requests.
  function postResolve() {
    res.status(200).send({
      presets: listPresets(req.t),
      customs: customKeys(), // List of custom preset machine names.
      internals: internalKeys(), // List of internal preset machine names.
    });
  }

  // Get presets.
  if (req.route.method === 'get') {
    postResolve();
    return true; // Tell endpoint wrapper we'll handle the GET response.
  }

  // Add implement.
  if (req.route.method === 'post') {
    // Validate data and add implement, or error out.
    validateData('drawing.implements', req.body, true)
      .then(add)
      .then(postResolve)
      .catch(err(res));

    return true; // Tell endpoint wrapper we'll handle the POST response.
  }

  // Error to client for unsupported request types.
  return false;
};

// Item handler.
handlers['/v2/implements/:implementName'] = (req, res) => {
  // Sanity check color ID
  let { implementName } = req.params;

  // Allow inherit to redirect to colorset parent default.
  if (implementName === IMPLEMENT_PARENT) {
    implementName = colors.set.implement;
  }

  const implement = get(implementName);

  if (!implement) {
    return {
      code: 404,
      body: {
        status: `Implement with name of '${implementName}' not found.`,
        validOptions: Object.keys(listPresets(req.t)),
      },
    };
  }

  // Display the item.
  if (req.route.method === 'get') {
    return { code: 200, body: implement };
  }

  // Patch item. Editing internal presets saves a new custom with override data.
  if (req.route.method === 'patch') {
    if (req.body.name) {
      return {
        code: 406,
        body: {
          status: 'error',
          message: singleLineString`You cannot rewrite an implement name in a patch.
          Delete item and recreate.`,
        },
      };
    }

    // Merge the incoming data with the existing object as we don't need delta.
    const mergedItem = merge(implement, req.body);

    // Validate the request data against the schema before continuing.
    validateData('implements', mergedItem, true)
      .then(edit)
      .then(finalItem => { res.status(200).send(finalItem); })
      .catch(err(res));

    return true; // Tell endpoint wrapper we'll handle the PATCH response.
  }

  // Delete item.
  if (req.route.method === 'delete') {
    // Notify client that they cannot delete internal presets.
    if (!get(implementName, true)) {
      return {
        code: 406,
        body: {
          status: 'You cannot delete internal presets.',
          validOptions: Object.keys(listPresets(req.t, true)),
        },
      };
    }

    // Actually delete.
    deleteImplement(implementName);
    return { code: 200, body: { status: 'success' } };
  }

  // Error to client for unsupported request types.
  return false;
};
