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

  // Add any custom fonts.
  cncserver.utils.getUserDirFiles('fonts', '*.svg', hershey.addSVGFont);

  // Problem: With really long strings, they never break on their own, so if by
  // default we wrap strings, lets format the text that goes in the stage
  // preview to have manual breaks in it.
  text.format = (text) => {
    const words = text.split(' ');
    let out = [];
    let lineLength = 0;
    words.forEach((word) => {
      lineLength += word.length;
      if (lineLength > 60) {
        lineLength = 0;
        out.push(`${word}\n`);
      } else {
        out.push(word);
      }
    });
    return out.join(' ');
  };

  /**
   * Returns a group of lines and characters rendered in single line hershey/SVG font.
   *
   * All raw values are in the font's number system before import scaling.
   */
  function renderHersheyPaths(textContent, bounds, settings) {
    // Render the text array.
    const textArray = hershey.renderTextArray(textContent, settings);

    const { view } = drawing.base.project;

    // Move through each char and build out chars and lines.
    const caretPos = new Point(0, 50);
    const chars = new Group(); // Hold output lines groups
    const lines = [new Group({ name: 'line-0' })]; // Hold chars in lines

    let cLine = 0;
    textArray.forEach((char, index) => {
      if (char.name === 'space' || char.name === 'newline') {
        caretPos.x += settings.spaceWidth + char.width;

        // Allow for wrapping based on wrapChars setting.
        let passedWrapWidth = false;
        if (char.name === 'space' && settings.wrapLines) {
          passedWrapWidth = caretPos.x > settings.wrapChars * char.width;
        }

        // Allow line wrap on space, or forced via newline.
        if (passedWrapWidth || char.name === 'newline') {
          // Before wrapping, reverse the order of the chars.
          lines[cLine].reverseChildren();

          caretPos.x = 0;
          // TODO: Get the actual base line height from the font.
          caretPos.y += 1000 + settings.lineHeight;

          cLine++;
          lines.push(new Group({ name: `line-${cLine}` }));
        }
      } else {
        // Create the compound path of the character.
        const c = new CompoundPath({
          data: { char: char.type },
          pathData: char.d,
          name: `letter-${char.type}-${index}-${cLine}`,
        });

        lines[cLine].insertChild(0, c);

        // TODO: Add this to settings with some kind of validation schema.
        if (settings.smooth) c.smooth(settings.smooth);

        // Rotate chararcters.
        if (settings.character.rotation) c.rotate(settings.character.rotation);

        // Align to the top left as expected by the font system.
        c.pivot = new Point(0, 0);
        c.position = [caretPos.x, caretPos.y];

        // Move the caret to the next position based on width and char spacing.
        caretPos.x += char.width + settings.character.spacing;

        // Flip the glyph over vertically.
        c.scale([1, -1]);
      }
    });

    // Reverse the chars in the line if only one line.
    if (cLine === 0) {
      lines[0].reverseChildren();
    }

    // Add all lines of text to the final group.
    chars.addChildren(lines);

    // Align the lines
    if (settings.align.paragraph === 'center') {
      lines.forEach((line) => {
        line.position.x = chars.position.x;
      });
    } else if (settings.align.paragraph === 'right') {
      lines.forEach((line) => {
        line.pivot = new Point(line.bounds.width, line.bounds.height / 2);
        line.position.x = chars.bounds.width;
      });
    }

    return chars;
  }

  /**
   * Return a group characters rendered in filled compound path system font.
   */
  function renderFilledText(textContent, hash, bounds, settings) {
    const canvas = createCanvas(8192, 1024);
    const {
      fontStyle, fontVariant, fontWeight, textBaseline = 'hanging', textAlign, systemFont,
    } = settings.text;
    const polygons = vectorizeText(textContent, {
      polygons: true,
      width: 200,
      font: systemFont,
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
      /* const anchorPos = drawing.base.getAnchorPos(chars, settings.anchor);
      const { view } = drawing.base.project;

      if (settings.position) {
        chars.position = new Point(settings.position).subtract(anchorPos);
      } else {
        chars.position = view.center.add(new Point(settings.hCenter, settings.vCenter));
      }
      chars.scale(settings.scale, anchorPos); */
    }

    // Fill each character if settings are given.
    if (settings.fill.render) {
      chars.children.forEach((char, subIndex) => {
        char.fillColor = settings.path.fillColor;
        cncserver.drawing.fill(char, hash, null, settings.fill, subIndex);
      });
    }

    return chars;
  }

  // Actually build the paths for drawing.
  text.draw = (textContent, hash, bounds, settings) => new Promise((resolve, reject) => {
    // Render content to the temp layer.
    drawing.base.layers.temp.activate();

    let chars;
    try {
      chars = settings.text.systemFont
        ? renderFilledText(textContent, hash, bounds, settings)
        : renderHersheyPaths(textContent, bounds, settings.text);
    } catch (error) {
      reject(error);
      return;
    }

    if (chars) {
      // Rotation!
      chars.rotate(settings.text.rotation);

      if (settings.stroke.render) {
        chars.strokeColor = settings.path.strokeColor;
        drawing.trace(chars, hash, bounds, settings.stroke);
      } else if (settings.fill.trace) {
        chars.strokeColor = settings.path.fillColor;
        drawing.trace(chars, hash, bounds, settings.stroke);
      }
    }
    resolve();
  });

  return text;
};
