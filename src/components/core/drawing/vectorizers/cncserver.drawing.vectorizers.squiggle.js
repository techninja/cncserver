/**
 * @file Squiggle vectorizer!
 */

const { Group, Path, Rectangle } = require('paper');
const util = require('./cncserver.drawing.vectorizers.util');

let exportGroup;
let evenOdd = null;
let settings = {
  sampleWidth: 2,
  lineHeight: 5,
  overlap: 1,
  maxDensity: 4,
  brightness: 0.05,
  joinPaths: true,
};

function bright(lum, amt) {
  return Math.min(1, lum + amt);
}

function renderSquiggleLine({ y, image, colorComponent = 'gray' }) {
  const {
    sampleWidth, lineHeight, maxDensity, brightness, joinPaths,
  } = settings;

  const line = new Path({
    strokeWidth: 0.2,
    strokeColor: colorComponent === 'gray' ? 'black' : colorComponent,
  });

  let yUp = true;
  for (let x = image.bounds.left; x < image.bounds.right; x += sampleWidth) {
    const area = new Rectangle(x, y, sampleWidth, lineHeight);
    const components = {
      cyan: 'red',
      magenta: 'green',
      yellow: 'blue',
      gray: 'gray',
      red: 'red',
      green: 'green',
      blue: 'blue',
    };

    const color = image.getAverageColor(area);
    if (color) {
      const lum = 1 - bright(color[components[colorComponent]], brightness);
      const amp = util.map(lum, 0, 1, 0, lineHeight / 2);
      // const iLum = 1 - lum;
      const density = Math.ceil(maxDensity * lum);
      const spacing = sampleWidth / density;

      // Add a straight point in the center if there's no data.
      if (!density) {
        line.add([x + sampleWidth / 2, y]);
      } else {
        // Add ad many points as density determines
        for (let d = 0; d < density; d++) {
          const height = yUp ? amp : -amp;
          line.add([x + (spacing * d), y + height]);

          yUp = !yUp;
        }
      }
    }
  }

  // Switch sides to every other.
  if (evenOdd === null) {
    evenOdd = true;
  } else {
    evenOdd = !evenOdd;
    if (evenOdd) line.reverse();
  }

  line.smooth();
  if (joinPaths && exportGroup.children.length) {
    const lastPath = exportGroup.children[exportGroup.children.length - 1];
    const { point } = lastPath.lastSegment;
    line.add([point.x, point.y]);
    lastPath.join(line);
    return null;
  }

  return line;
}

// Connect to the main process, start the fill operation.
util.connect((image, settingsOverride) => {
  settings = { ...settings, ...settingsOverride };
  const { lineHeight, overlap } = settings;
  exportGroup = new Group();

  // Grayscale Squiggle
  for (let y = image.bounds.top + lineHeight; y < image.bounds.height; y = y + lineHeight - overlap) {
    // const y = image.bounds.top + lineHeight;
    const path = renderSquiggleLine({ y, image });
    exportGroup.addChild(path);
  }

  /* ['cyan', 'magenta', 'yellow'].forEach(colorComponent => {
      for (let y = image.bounds.top + lineHeight; y < image.bounds.bottom; y = y + lineHeight - overlap) {
        renderSquiggleLine({y, sampleWidth, lineHeight, maxDensity, image, brightness: 0.12, colorComponent});
      }
    }); */

  // exportGroup.addChildren(items);
  util.finish(exportGroup);
});
