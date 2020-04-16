/**
 * @file Squiggle vectorizer!
 */

const { Group, Path } = require('paper');
const util = require('../cncserver.drawing.vectorizers.util');

const components = {
  cyan: 'red',
  magenta: 'green',
  yellow: 'blue',
  gray: 'gray',
  red: 'red',
  green: 'green',
  blue: 'blue',
};

let exportGroup;
let evenOdd = null;
let settings = {}; // Globalization of full passed settings.vectorize >

function bright(lum, amt) {
  return Math.min(1, lum + amt);
}

function newPath(colorComponent) {
  return new Path({
    strokeWidth: 0.2,
    strokeColor: colorComponent === 'gray' ? 'black' : colorComponent,
  });
}

function renderSquiggleAlongPath(image, path, colorComponent) {
  const {
    maxDensity, spacing, sampleWidth, overlap, skipWhite,
  } = settings.squiggle;

  let yUp = true;
  let line = newPath(colorComponent);
  for (let pos = 0; pos < path.length; pos += sampleWidth) {
    try {
      const normals = [
        path.getNormalAt(pos).multiply(spacing / 2),
        path.getNormalAt(pos + sampleWidth).multiply(spacing / 2),
      ];
      const points = [path.getPointAt(pos), path.getPointAt(pos + sampleWidth)];
      const area = new Path([
        points[0].subtract(normals[0]),
        points[0].add(normals[0]),
        points[1].add(normals[1]),
        points[1].subtract(normals[1]),
      ]);

      const color = image.getAverageColor(area);
      if (color) {
        const lum = 1 - bright(color[components[colorComponent]], 0.1);
        const amp = util.map(lum, 0, 1, 0, (spacing + overlap) / 2);
        const density = Math.ceil(maxDensity * lum);
        const pointSpacing = sampleWidth / density;

        // Add a straight point in the center and end path for pure white.
        if (!density) {
          if (!skipWhite) {
            // const centerPos = pos + (sampleWidth / 2);
            line.add(path.getPointAt(pos + sampleWidth));
          }

          if (line.segments.length && skipWhite) {
            line.smooth();
            exportGroup.addChild(line);
            line = newPath(colorComponent);
          }
        } else {
          // Add as many points as density determines
          for (let d = 0; d < density; d++) {
            const height = yUp ? amp : -amp;
            const dPos = pos + (pointSpacing * d);
            const norm = path.getNormalAt(dPos).multiply(height);
            line.add(path.getPointAt(dPos).add(norm));

            yUp = !yUp;
          }
        }
      } else if (line.segments.length) {
        // If we're outside of the raster's boundaries, cut the line off.
        line.smooth();
        exportGroup.addChild(line);
        line = newPath(colorComponent);
      }
    } catch (error) {
      // If there's an error here, it's likely from trying to sample beyond
      // the path end or raster restrictions, which we can safely ignore.
    }
  }

  // If there's anything left after we're done, add it in.
  if (line.segments) {
    line.smooth();
    exportGroup.addChild(line);
  }
}

// Connect to the main process, start the fill operation.
util.connect('paper', (image, rawSettings) => {
  settings = { ...rawSettings };

  // Convert color components from the schema verifiable object into the array
  // that's not, but is way easier to work with.
  const arrCC = [];
  Object.entries(settings.squiggle.colorComponents).forEach(([color, doProcess]) => {
    if (doProcess) arrCC.push(color);
  });
  if (!arrCC.length) arrCC.push('gray');
  settings.squiggle.colorComponents = arrCC;

  const {
    spacing, overlap, joinPaths, style, angle, colorComponents,
  } = settings.squiggle;
  exportGroup = new Group();

  // Back and forth line sweeping
  if (style === 'lines') {
    // Build group with double length, double height lines to overlay
    const guideLines = new Group();
    for (let y = image.bounds.top + spacing / 2; y < image.bounds.bottom + image.bounds.height; y = y + spacing - overlap) {
      guideLines.addChild(new Path([
        [image.bounds.left - image.bounds.width, y],
        [image.bounds.right, y],
      ]));
    }

    guideLines.strokeWidth = 1; guideLines.strokeColor = 'red';
    // exportGroup.addChild(guideLines);
    guideLines.position = image.position.add(settings.squiggle.offset);

    colorComponents.forEach((colorComponent, index) => {
      guideLines.rotation = angle + ((360 / colorComponents.length) * index);

      // Render squiggles for each guide line.
      guideLines.children.forEach((guideLine) => {
        // Flip every other line around for easy reconnection
        if (evenOdd === null) {
          evenOdd = true;
        } else {
          evenOdd = !evenOdd;
          if (evenOdd) guideLine.reverse();
        }

        renderSquiggleAlongPath(image, guideLine, colorComponent);

        if (joinPaths && exportGroup.children.length > 1) {
          const lastPath = exportGroup.children[exportGroup.children.length - 2];
          const line = exportGroup.children[exportGroup.children.length - 1];

          if (lastPath.lastSegment) {
            const { point } = lastPath.lastSegment;
            line.add([point.x, point.y]);
            lastPath.join(line);
          }
        }
      });
    });
  } else if (style === 'spiral') {
    const spiral = util.generateSpiralPath(spacing, image.bounds, settings.squiggle.offset);
    colorComponents.forEach((colorComponent, index) => {
      spiral.rotation = angle + ((360 / colorComponents.length) * index);
      renderSquiggleAlongPath(image, spiral, colorComponent);
    });
  }

  util.finish(exportGroup);
});
