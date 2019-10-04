/**
 * @file Code for text rendering.
 */
const hershey = require('hersheytext');
const {
  Path, CompoundPath, Point, Group,
} = require('paper');

module.exports = (cncserver, drawing) => {
  const text = (hash, payload) => {
    const defaults = {
      spaceWidth: 15,
      charSpacing: 3,
      lineHeight: 15,
      anchor: { x: 0, y: 0 },
      scale: 1,
      hCenter: 0,
      vCenter: 0,
      textAlign: 'left',
      rotation: 0,
    };

    // Mesh in option defaults
    const options = {
      ...defaults,
      ...payload.settings,
    };

    // Render the text array.
    const t = hershey.renderTextArray(payload.body, {
      ...options,
      id: payload.name,
      pos: { x: 0, y: 0 },
    });

    const { view } = drawing.base.project;

    // Move through each char and build out chars and lines.
    const caretPos = new Point(0, 50);
    const chars = new Group(); // Hold output lines groups
    const lines = [new Group()]; // Hold chars in lines

    let cLine = 0;
    t.forEach((char, index) => {
      if (char.type === 'space' || char.type === 'newline') {
        caretPos.x += options.spaceWidth;

        // Allow line wrap on space
        if (caretPos.x > options.wrapWidth || char.type === 'newline') {
          // Before wrapping, reverse the order of the chars.
          lines[cLine].reverseChildren();

          caretPos.x = 0;
          caretPos.y += options.lineHeight;

          cLine++;
          lines.push(new Group());
        }
      } else {
        const data = {
          d: char.d,
          char: char.type,
          name: `letter-${char.type} - ${index}-${cLine}`,
          type: 'stroke',
        };

        // Create the compound path as a group to retain subpath data.
        const c = new Group();
        lines[cLine].insertChild(0, c);

        // Use CompoundPath as a simple parser to get the subpaths, then add
        // them to our group and set the details in the subpath.
        const tmpCompound = new CompoundPath(char.d);

        if (options.smooth) {
          tmpCompound.smooth(options.smooth);
        }
        tmpCompound.children.forEach((subpath) => {
          c.addChild(new Path({
            data,
            pathData: subpath.pathData,
            strokeWidth: options.strokeWidth,
            strokeColor: options.strokeColor,
          }));
        });
        tmpCompound.remove();

        // Align to the top left as expected by the font system
        const b = c.bounds;
        c.pivot = new Point(0, 0);
        c.position = caretPos;

        // Move the caret to the next position based on width and char spacing
        caretPos.x += b.width + options.charSpacing;
      }
    });

    // Reverse the chars in the line if only one line.
    if (cLine === 0) {
      lines[0].reverseChildren();
    }

    // Add all lines of text to the final group.
    chars.addChildren(lines);

    // Text sizing and position!
    if (payload.bounds) {
      // Scale and fit within the given bounds rectangle.
      drawing.base.fitBounds(chars, payload.bounds);
    } else {
      // Position off from center, or at exact position.
      const anchorPos = drawing.base.getAnchorPos(chars, options.anchor);

      if (options.position) {
        options.position = new Point(options.position);
        chars.position = options.position.subtract(anchorPos);
      } else {
        chars.position = view.center.add(new Point(options.hCenter, options.vCenter));
      }
      chars.scale(options.scale, anchorPos);
    }

    // Align the lines
    if (options.textAlign === 'center') {
      lines.forEach((line) => {
        line.position.x = chars.position.x;
      });
    } else if (options.textAlign === 'right') {
      lines.forEach((line) => {
        line.pivot = new Point(line.bounds.width, line.bounds.height / 2);
        line.position.x = chars.bounds.width;
      });
    }

    // Rotation!
    chars.rotate(options.rotation);

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();

    // Trace all the paths!
    const allPaths = drawing.base.getPaths(chars);

    // Move through all paths and add each one as a job.
    allPaths.forEach((path) => {
      // Only add non-zero length path tracing jobs.
      if (path.length) {
        cncserver.jobs.addItem({
          operation: 'trace',
          type: 'job',
          parent: hash,
          body: path,
        });
      }
    });
  };


  return text;
};
