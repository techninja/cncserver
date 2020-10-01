/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {

  // Unified item not found.
  function notFound(name) {
    return {
      code: 404,
      body: {
        status: 'error',
        message: `Tool: '${name}' not found.`,
        validOptions: cncserver.tools.getNames(),
      },
    };
  }

  // Primary tools endpoint handler. List, create.
  handlers['/v2/tools'] = function toolsMain(req, res) {
    const { tools, schemas, utils, rest } = cncserver;

    // Get list of tools
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: {
          set: tools.getResponseSet(res.t),
          tools: tools.items(),
          presets: tools.listPresets(),
          customs: tools.customKeys(), // List of custom preset machine names.
          internals: tools.internalKeys(), // List of internal preset machine names.
          invalidSets: tools.invalidPresets(),
        }
      };
    }

    // Add new custom tool.
    if (req.route.method === 'post') {
      // Validate data and add tool item, or error out.
      schemas.validateData('tools', req.body, true)
        .then(tools.add)
        .then((tool) => { res.status(200).send(tool); })
        .catch(rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the POST response.
    }

    // Change toolset options directly.
    if (req.route.method === 'patch') {
      // If item data is attempted to be changed here, give a specific message for it.
      if (req.body.items) {
        rest.err(res, 406)(
          new Error(utils.singleLineString`Patching the tools endpoint can only edit the
            current toolset details, not individual tool items.
            Patch to /v2/tools/[ID] to edit a custom toolset item.`
          )
        );
      }

      // Merge with current set, validate data, then edit.
      const set = { ...tools.set };
      delete set.items;
      const mergedItem = utils.merge(set, req.body);
      schemas.validateData('toolsets', mergedItem, true)
        .then(tools.editSet)
        .then((set) => { res.status(200).send(set); })
        .catch(rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Tool specific enpoint.
  handlers['/v2/tools/:toolID'] = function toolsItemMain(req, res) {
    const { toolID } = req.params;
    const { tools, utils } = cncserver;
    const tool = tools.getItem(toolID);

    // Sanity check tool.
    if (!tool) return notFound(toolID);

    // Set current end of buffer tool to ID.
    if (req.route.method === 'put') {
      cncserver.tools.changeTo(tool.id, null, () => {
        res.status(200).send(JSON.stringify({
          status: `Tool changed to ${tool.id}`,
        }));

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, 200, `Tool:${tool.id}`);
        }
      }, req.body.waitForCompletion);
      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Edit tool by ID (Only allow editing of colorset tools).
    if (req.route.method === 'patch') {
      // No rewriting ID via patch.
      if (req.body.id) {
        return {
          code: 406,
          body: {
            status: 'error',
            message: 'You cannot rewrite a tool ID in a patch. Delete item and recreate.'
          },
        };
      }

      // Only edit colorset tools.
      if (!tools.canEdit(toolID)) {
        return {
          code: 406,
          body: {
            status: 'error',
            message: 'This is a bot level tool, you can only edit colorset level tools via the API.',
            allowedValues: tools.canEdit(),
          },
        };
      }

      // Merge the incoming data with the existing object as we don't need delta.
      const mergedItem = utils.merge(tool, req.body);

      // Validate the request data against the schema before continuing.
      cncserver.schemas.validateData('tools', mergedItem, true)
        .then(tools.edit)
        .then((finalItem) => { res.status(200).send(finalItem); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    // Delete color
    if (req.route.method === 'delete') {
      // Only allow deleting colorset tools.
      if (!tools.canEdit(toolID)) {
        return {
          code: 406,
          body: {
            status: 'error',
            message: 'This is a bot level tool, you can only delete colorset level tools via the API.',
            validOptions: tools.canEdit(),
          },
        };
      }

      tools.delete(toolID);
      return { code: 200, body: { tools: tools.items() } };
    }

    // Error to client for unsupported request types.
    return false;
  };

  // "wait" manual swap toolchanges with index
  handlers['/v2/tools/:tool/:index'] = function toolsIndex(req, res) {
    const toolIndex = req.params.index;
    const { tools } = cncserver;
    const tool = tools.getItem(req.params.tool);

    // Sanity check tool.
    if (!tool) return notFound(req.params.tool);


    if (req.route.method === 'put') { // Set Tool
      tools.changeTo(tool.id, toolIndex, () => {
        // TODO: Is this force state needed?
        cncserver.pen.forceState({ tool: tool.id });
        res.status(200).send(JSON.stringify({
          status: `Tool changed to ${tool.id}, for index ${toolIndex}`,
        }));

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, 200, `Tool:${toolName}, Index:${toolIndex}`);
        }
      }, req.body.waitForCompletion);
      return true; // Tell endpoint wrapper we'll handle the response

    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
