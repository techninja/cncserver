/**
 * @file Abstraction module for tool state and helper methods.
 */
const { Path, Group, PointText } = require('paper');

const tools = {
  id: 'tools',
};

module.exports = (cncserver) => {

  // Get a flat array of tools.
  tools.items = () => [
    ...tools.getBotTools(),
    ...cncserver.drawing.colors.set.tools,
  ];

  tools.getNames = () => tools.items().map(({ id }) => id);

  // Flatten bot tools to array.
  tools.getBotTools = () => {
    const botTools = cncserver.settings.botConf.get('tools');
    const out = [];

    Object.entries(botTools).forEach(([id, tool]) => {
      out.push({
        id,
        parent: '',
        ...tool,
        x: parseFloat(tool.x),
        y: parseFloat(tool.y),
        width: tool.width ? parseFloat(tool.width) : 0,
        height: tool.height ? parseFloat(tool.height) : 0,
      });
    });
    return out;
  };

  // Get a single item, undefined if invalid.
  tools.getItem = name => tools.items().find(({ id }) => id === name);

  /**
   * Run the operation to set the current tool (and any aggregate operations
   * required) into the buffer
   *
   * @param name
   *   The machine name of the tool (as defined in the bot config file).
   * @param index
   *   Index for notifying user of what the manual tool change is for.
   * @param callback
   *   Triggered when the full tool change is to have been completed, or on
   *   failure.
   * @param waitForCompletion
   *   Pass false to call callback immediately after calculation, true to
   *   callback only after physical movement is complete.
   *
   * @returns {boolean}
   *   True if success, false on failure.
   */
  tools.set = (name, index = null, callback = () => { }, waitForCompletion = false) => {
    // Get the matching tool object from the bot configuration.
    const tool = tools.getItem(name);

    // No tool found with that name? Augh! Run AWAY!
    if (!tool) {
      cncserver.run('callback', callback);
      return false;
    }

    // For wait=false/"resume" tools, we really just resume the buffer.
    // It should be noted, this is obviously NOT a queable toolchange.
    // This should ONLY be called to restart the queue after a swap.
    if (tool.wait !== undefined && tool.wait === false) {
      cncserver.buffer.resume();
      callback(1);
      return true;
    }

    // Pen Up
    cncserver.pen.setHeight('up');

    // Figure out the final position:
    let toolPos = { x: tool.x, y: tool.y };

    // Is there a parent? Offset for that.
    const parent = tools.getItem(tool.parent);
    if (parent) {
      toolPos.x += parseFloat(parent.x);
      toolPos.y += parseFloat(parent.y);
    }

    // Convert MM to Abs steps.
    toolPos = cncserver.utils.absToSteps(toolPos, 'mm', true);

    // Prevent out of bounds moves.
    toolPos = cncserver.utils.sanityCheckAbsoluteCoord(toolPos);

    // Move to the tool
    cncserver.control.movePenAbs(toolPos);

    // Set the tip of state pen to the tool now that the change is done.
    cncserver.pen.forceState({ tool: name });

    // Trigger the binder event.
    cncserver.binder.trigger('tool.change', {
      ...tool,
      index,
      name,
    });

    // Finish up.
    if (waitForCompletion) { // Run inside the buffer
      cncserver.run('callback', callback);
    } else { // Run as soon as items have been buffered
      callback(1);
    }

    return true;
  };

  // Bind to tools.update to redraw the tools layer.
  cncserver.binder.bindTo('tools.update', tools.id, () => {
    const { layers } = cncserver.drawing.base;
    const toolGroup = new Group();
    const items = tools.items();

    layers.tools.removeChildren();

    // Create a representation path for each tool.
    items.forEach((tool) => {
      const toolPos = { x: tool.x, y: tool.y };

      // Offset for center positions.
      if (tool.position === 'center') {
        toolPos.x -= tool.width / 2;
        toolPos.y -= tool.height / 2;
      }

      // Apply parent offset.
      const parent = tools.getItem(tool.parent);
      if (parent) {
        toolPos.x += parent.x;
        toolPos.y += parent.y;
      }

      // Don't try to display tools without size.
      if (tool.width && tool.height) {
        const path = new Path.Rectangle({
          ...toolPos,
          width: tool.width,
          height: tool.height,
          radius: tool.radius,
          name: tool.id,
          strokeWidth: 1,
          strokeColor: 'black',
          fillColor: cncserver.drawing.colors.getToolColor(tool.id),
        });

        const label = new PointText({ fontSize: 8, content: tool.id, opacity: 0.5 });
        label.fitBounds(path.bounds);
        toolGroup.addChild(new Group([path, label]));
      }
    });

    layers.tools.addChild(toolGroup);
    cncserver.sockets.sendPaperUpdate('tools');
  });

  return tools;
};
