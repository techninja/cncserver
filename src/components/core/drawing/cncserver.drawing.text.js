/**
 * @file Code for text rendering.
 */
const hershey = require('hersheytext');
const vectorizeText = require('vectorize-text');
const { createCanvas } = require('canvas');

const {
  Path, CompoundPath, Point, Group,
} = require('paper');

const text = {};

module.exports = (cncserver, drawing) => {
  text.fonts = hershey.svgFonts;

  // Provide default settings.
  text.defaultSettings = () => ({
    spaceWidth: 20,
    font: 'hershey_sans_1',
    charSpacing: 18,
    lineHeight: 15,
    anchor: { x: 0, y: 0 },
    scale: 1,
    hCenter: 0,
    vCenter: 0,
    textAlign: 'left',
    rotation: 0,
  });

  /**
   * Returns a group of lines and characters rendered in single line hersheyfont
   */
  text.renderHersheyPaths = (textContent, bounds, settings) => {
    // Render the text array.
    const t = hershey.renderTextArray(textContent, {
      ...settings,
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
        caretPos.x += settings.spaceWidth;

        // Allow line wrap on space
        if (caretPos.x > settings.wrapWidth || char.type === 'newline') {
          // Before wrapping, reverse the order of the chars.
          lines[cLine].reverseChildren();

          caretPos.x = 0;
          caretPos.y += settings.lineHeight;

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

        if (settings.smooth) {
          tmpCompound.smooth(settings.smooth);
        }
        tmpCompound.children.forEach((subpath) => {
          c.addChild(new Path({
            data,
            pathData: subpath.pathData,
            strokeWidth: settings.strokeWidth,
            strokeColor: settings.strokeColor,
          }));
        });
        tmpCompound.remove();

        // Align to the top left as expected by the font system
        const b = c.bounds;
        c.pivot = new Point(0, 0);
        c.position = caretPos;

        // Move the caret to the next position based on width and char spacing
        caretPos.x += b.width + settings.charSpacing;
      }
    });

    // Reverse the chars in the line if only one line.
    if (cLine === 0) {
      lines[0].reverseChildren();
    }

    // Add all lines of text to the final group.
    chars.addChildren(lines);

    // Text sizing and position!
    if (bounds) {
      // Scale and fit within the given bounds rectangle.
      drawing.base.fitBounds(chars, bounds);
    } else {
      // Position off from center, or at exact position.
      const anchorPos = drawing.base.getAnchorPos(chars, settings.anchor);

      if (settings.position) {
        chars.position = new Point(settings.position).subtract(anchorPos);
      } else {
        chars.position = view.center.add(new Point(settings.hCenter, settings.vCenter));
      }
      chars.scale(settings.scale, anchorPos);
    }

    // Align the lines
    if (settings.textAlign === 'center') {
      lines.forEach((line) => {
        line.position.x = chars.position.x;
      });
    } else if (settings.textAlign === 'right') {
      lines.forEach((line) => {
        line.pivot = new Point(line.bounds.width, line.bounds.height / 2);
        line.position.x = chars.bounds.width;
      });
    }

    return chars;
  };

  /**
   * Return a group characters rendered in filled compound path system font.
   */
  text.renderFilledText = (textContent, bounds, settings) => {
    const canvas = createCanvas(8192, 1024);
    const {
      fontStyle, fontVariant, fontWeight, textBaseline = 'hanging', textAlign,
    } = settings;
    const polygons = vectorizeText(textContent, {
      polygons: true,
      width: 200,
      font: settings.systemFont,
      context: canvas.getContext('2d'),
      fontStyle,
      fontVariant,
      fontWeight,
      textBaseline,
      textAlign,
      canvas,
    });

    const chars = new Group();
    polygons.forEach((loops) => {
      let d = '';
      loops.forEach((loop) => {
        loop.forEach(([x, y], index) => {
          const op = index === 0 ? 'M' : 'L';
          d = `${d} ${op} ${x} ${y}`;
        });

        // Add the first point back as end point.
        d = `${d} L ${loop[0][0]} ${loop[0][1]}`;
      });
      chars.addChild(new CompoundPath(d));
    });


    // Text sizing and position!
    if (bounds) {
      // Scale and fit within the given bounds rectangle.
      drawing.base.fitBounds(chars, bounds);
    } else {
      // Position off from center, or at exact position.
      const anchorPos = drawing.base.getAnchorPos(chars, settings.anchor);
      const { view } = drawing.base.project;

      if (settings.position) {
        chars.position = new Point(settings.position).subtract(anchorPos);
      } else {
        chars.position = view.center.add(new Point(settings.hCenter, settings.vCenter));
      }
      chars.scale(settings.scale, anchorPos);
    }

    // Fill each character if settings are given.
    if (typeof settings.fillSettings === 'object') {
      chars.children.forEach((char) => {
        char.fillColor = settings.color;
        cncserver.actions.addItem({
          operation: 'fill',
          type: 'job',
          parent: '123',
          body: char.exportJSON(),
          settings: settings.fillSettings,
        });
      });
    }

    return chars;
  };

  // Actually build the paths for drawing.
  text.draw = (textContent, hash, parent = null, bounds, requestSettings) => {
    // Mesh in settings defaults
    const settings = { ...text.defaultSettings(), ...requestSettings };

    // Render content straight to the preview layer.
    drawing.base.layers.preview.activate();

    const chars = settings.systemFont
      ? text.renderFilledText(textContent, bounds, settings)
      : text.renderHersheyPaths(textContent, bounds, settings);

    if (chars) {
      // Apply color/stroke.
      chars.strokeColor = settings.color;
      chars.strokeWidth = 1;

      // Nothing on preview should have a fill.
      chars.fillColor = null;

      // Rotation!
      chars.rotate(settings.rotation);

      // Update client preview.
      cncserver.sockets.sendPaperPreviewUpdate();
    }
  };

  return text;
};
