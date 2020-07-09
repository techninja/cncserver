/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {

  // Unified item not found.
  function notFound(name) {
    return [
      404,
      cncserver.utils.singleLineString`
        Tool: '${name}' not found.
        Must be one of: '${cncserver.tools.getNames().join("', '")}
      '.`,
    ];
  }

  handlers['/v2/tools'] = function toolsGet(req) {
    const { tools } = cncserver;
    if (req.route.method === 'get') { // Get list of tools
      return {
        code: 200,
        body: {
          tools: tools.items(),
        },
      };
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Standard toolchanges.
  // TODO: Prevent manual swap "wait" toolchanges on this endpoint?
  handlers['/v2/tools/:tool'] = function toolsMain(req, res) {
    const { tools } = cncserver;
    const tool = tools.getItem(req.params.tool);

    // Sanity check tool.
    if (!tool) return notFound(req.params.tool);

    // TODO: Support other tool methods... (needs API design!)
    if (req.route.method === 'put') { // Set Tool
      cncserver.tools.set(tool.id, null, () => {
        res.status(200).send(JSON.stringify({
          status: `Tool changed to ${tool.id}`,
        }));

        if (cncserver.settings.gConf.get('debug')) {
          console.log('>RESP', req.route.path, 200, `Tool:${tool.id}`);
        }
      }, req.body.waitForCompletion);
      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Error to client for unsupported request types.
    return false;
  };

  // "wait" manual swap toolchanges with index
  handlers['/v2/tools/:tool/:index'] = function toolsMain(req, res) {
    const toolIndex = req.params.index;
    const { tools } = cncserver;
    const tool = tools.getItem(req.params.tool);

    // Sanity check tool.
    if (!tool) return notFound(req.params.tool);


    if (req.route.method === 'put') { // Set Tool
      tools.set(tool.id, toolIndex, () => {
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
