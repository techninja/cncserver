/**
 * @file Holds "preview" batch drawing helpers for the CNCServer GUI.
 */
/* eslint-env browser */
/* globals cncserver, cstate, paper */
import shapes from './shapes.mjs';

const preview = {};

preview.fonts = ({
  textHeight = 25,
  boxWidth = 50,
  labelHeight = 5,
  rightMargin = 18,
  bottomMargin = 5,
  testText = 'ABC ~ 123',
} = {}) => {
  const { api: { actions: { text, stat } } } = cncserver;

  stat().then(({ data: { options: { operations, bounds } } }) => {
    let pos = [bounds.point[0], bounds.point[1]];
    const max = [bounds.point[0] + bounds.size[0], bounds.point[1] + bounds.size[1]];
    Object.entries(operations.text.fonts).forEach(([font, info]) => {
      const textBounds = {
        point: [pos[0], pos[1]],
        size: [boxWidth, textHeight],
      };

      const labelBounds = {
        point: [pos[0], pos[1] + textHeight],
        size: [boxWidth, labelHeight],
      };

      text(testText, textBounds, { font });
      text(info.name, labelBounds);

      // Move next pos right >>
      pos[0] = pos[0] + boxWidth + rightMargin;

      // If over the right, reset X, move down.
      if (pos[0] + boxWidth > max[0]) {
        pos = [bounds.point[0], pos[1] + textHeight + labelHeight + bottomMargin];
      }
    });
  });
};

preview.fill = () => {
  const exampleRows = [];

  // Offset fill examples
  exampleRows.push({
    title: 'Offset',
    examples: [
      {
        label: 'Default: 3mm space, 1/4mm res',
        settings: {},
      },
      {
        label: '1mm space, 1/4mm res',
        settings: { spacing: 1 },
      },
      {
        label: '3mm space, 1mm res',
        settings: { flattenResolution: 1 },
      },
      {
        label: '4mm space, 1/4mm res',
        settings: { spacing: 4 },
      },
    ],
  });

  // Pattern fill examples
  exampleRows.push({
    title: 'Pattern / Spiral',
    examples: [
      {
        label: 'Default: Spiral 3mm',
        settings: { method: 'pattern' },
      },
      {
        label: 'Spiral 1mm',
        settings: { method: 'pattern', spacing: 1 },
      },
      {
        label: 'Circuit Board, 0.25x',
        settings: { method: 'pattern', pattern: 'circuit-board', scale: 0.25 },
      },
      {
        label: 'Kiwi 45°, 0.5x',
        settings: {
          method: 'pattern', pattern: 'kiwi', rotation: 45, scale: 0.5,
        },
      },
      {
        label: 'Anchors Away 0.4x',
        settings: { method: 'pattern', pattern: 'anchors-away', scale: 0.4 },
      },
      {
        label: 'Topography 0.1x',
        settings: { method: 'pattern', pattern: 'topography', scale: 0.1 },
      },
    ],
  });

  // Hatch fill examples
  exampleRows.push({
    title: 'Line based pattern',
    examples: [
      {
        label: 'Default: 3mm space, 28°',
        settings: { method: 'pattern', pattern: 'line' },
      },
      {
        label: '2mm space, 45°',
        settings: {
          method: 'pattern', spacing: 2, angle: 45, pattern: 'line',
        },
      },
      {
        label: '5mm, hatch',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 5,
          lineOptions: {
            density: 2,
          },
        },
      },
      {
        label: '??',
        settings: { method: 'hatch', pattern: 'zigstraight' },
      },
    ],
  });

  preview.renderExamples(exampleRows);
};

preview.patternFillPreview = () => {
  const exampleRows = [];

  exampleRows.push({
    title: 'Pattern Fill Types',
    examples: [
      {
        label: 'Anchors Away 0.3x',
        settings: { method: 'pattern', pattern: 'anchors-away', scale: 0.3 },
      },
      {
        label: 'Autumn, 0.5x',
        settings: { method: 'pattern', pattern: 'autumn', scale: 0.5 },
      },
      {
        label: 'Bank Note, 0.5x',
        settings: { method: 'pattern', pattern: 'bank-note', scale: 0.5 },
      },
      {
        label: 'Bevel Circle, 0.25x',
        settings: { method: 'pattern', pattern: 'bevel-circle', scale: 0.25 },
      },
      {
        label: 'Circuit Board, 0.25x',
        settings: { method: 'pattern', pattern: 'circuit-board', scale: 0.25 },
      },
    ],
  });

  exampleRows.push({
    examples: [
      {
        label: 'Current, 0.5x',
        settings: { method: 'pattern', pattern: 'current', scale: 0.5 },
      },
      {
        label: 'Endless Clouds, 0.5x',
        settings: { method: 'pattern', pattern: 'endless-clouds', scale: 0.5 },
      },
      {
        label: 'Happy Intersection, 0.5x',
        settings: { method: 'pattern', pattern: 'happy-intersection', scale: 0.5 },
      },
      {
        label: 'Hexagons, 0.5x',
        settings: { method: 'pattern', pattern: 'hexagons', scale: 0.5 },
      },
      {
        label: 'Kiwi, 0.5x',
        settings: { method: 'pattern', pattern: 'kiwi', scale: 0.5 },
      },
    ],
  });

  exampleRows.push({
    examples: [
      {
        label: 'Line in Motion, 0.25x',
        settings: { method: 'pattern', pattern: 'line-in-motion', scale: 0.25 },
      },
      {
        label: 'Stamp Collection, 0.25x',
        settings: { method: 'pattern', pattern: 'stamp-collection', scale: 0.25 },
      },
      {
        label: 'Temple, 0.25x',
        settings: { method: 'pattern', pattern: 'temple', scale: 0.25 },
      },
      {
        label: 'Topography, 0.3x',
        settings: { method: 'pattern', pattern: 'topography', scale: 0.3 },
      },
      {
        label: 'Wiggle, 0.8x',
        settings: { method: 'pattern', pattern: 'wiggle', scale: 0.8 },
      },
    ],
  });

  preview.renderExamples(exampleRows);
};

preview.lineFillPreview = () => {
  const exampleRows = [];

  exampleRows.push({
    title: 'Pattern Fill Line examples',
    examples: [
      {
        label: 'Basic Line, 10mm @ 0°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          lineOptions: { type: 'straight', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Basic Line, 10mm @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: { type: 'straight', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Basic Line, Density 2 @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: {
            type: 'straight', wavelength: 10, amplitude: 8, density: 2,
          },
        },
      },

      {
        label: 'Basic Line, Density 5',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          inset: 2,
          lineOptions: {
            type: 'straight', wavelength: 10, amplitude: 8, density: 5,
          },
        },
      },
    ],
  });

  exampleRows.push({
    examples: [
      {
        label: 'Sine Line 10/10/8',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          lineOptions: { type: 'sine', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Sine Line @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: { type: 'sine', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Sine Line, Density 2 @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: {
            type: 'sine', wavelength: 10, amplitude: 8, density: 2,
          },
        },
      },

      {
        label: 'Sine Line, Density 5',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          lineOptions: {
            type: 'sine', wavelength: 10, amplitude: 8, density: 5,
          },
        },
      },
    ],
  });

  exampleRows.push({
    examples: [
      {
        label: 'Saw Line 10/10/8',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          lineOptions: { type: 'saw', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Saw Line @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: { type: 'saw', wavelength: 10, amplitude: 8 },
        },
      },

      {
        label: 'Saw Line, Density 2 @ 45°',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 45,
          lineOptions: {
            type: 'saw', wavelength: 10, amplitude: 8, density: 2,
          },
        },
      },

      {
        label: 'Saw Line, Density 5',
        settings: {
          method: 'pattern',
          pattern: 'line',
          spacing: 10,
          rotation: 0,
          lineOptions: {
            type: 'saw', wavelength: 10, amplitude: 8, density: 5,
          },
        },
      },
    ],
  });

  preview.renderExamples(exampleRows);
};

// Render an object/array of fill examples
preview.renderExamples = (exampleRows, options) => {
  const {
    api: {
      actions: {
        stat, text, strokePath, fillPath,
      },
    },
  } = cncserver;

  const opt = {
    fillObject: shapes.compound.fill,
    titleHeight: 8,
    labelHeight: 5,
    boxHeight: 50,
    rightMargin: 8,
    bottomMargin: 8,
    ...options,
  };

  stat().then(({ data: { options: { bounds } } }) => {
    let pos = [bounds.point[0], bounds.point[1]];

    exampleRows.forEach((row) => {
      if (row.title) {
        text(row.title, {
          point: [pos[0], pos[1]],
          size: [bounds.size[0], opt.titleHeight],
        });
        // Move base Y pos to bottom of row title
        pos[1] += opt.titleHeight;
      }

      const boxWidth = Math.round(bounds.size[1] / (row.examples.length - 1));
      row.examples.forEach((example) => {
        const boxBounds = { point: [pos[0], pos[1]], size: [boxWidth, opt.boxHeight] };
        fillPath(opt.fillObject, boxBounds, example.settings);
        strokePath(opt.fillObject, boxBounds, example.settings);

        // Draw label.
        text(example.label, {
          point: [pos[0], pos[1] + opt.boxHeight],
          size: [boxWidth, opt.labelHeight],
        });

        // Next position right >>
        pos[0] = pos[0] + boxWidth + opt.rightMargin;
      });

      // Next position down.
      pos = [
        bounds.point[0],
        pos[1] + opt.labelHeight + opt.boxHeight + opt.bottomMargin,
      ];
    });
  });
};

preview.drawRuler = ({
  vertical = false, // True for vertical
  pos = { x: 20, y: 20 }, // Position on the canvas
  length = 250, // Length in MM
  height = 50, // Ruler height.
  tickSizes = {
    1: 2.5,
    5: 7,
    10: 10,
  },
  border = 2,
} = {}) => {
  cstate.layers.drawing.activate();
  const ruler = new paper.CompoundPath();
  ruler.strokeWidth = 0.5;
  ruler.strokeColor = 'black';

  // Add the rectangle.
  ruler.addChild(new paper.Path({
    segments: [
      [pos.x, pos.y],
      [pos.x + length, pos.y],
      [pos.x + length, pos.y + height],
      [pos.x, pos.y + height],
    ],
    closed: true,
  }));

  // Loop over X positions from left to right.
  let counter = 0;
  for (let x = 0; x <= length - border; x++) {
    const drawX = pos.x + border + x;

    let hIndex = -1; // Default to small tick.
    Object.keys(tickSizes).forEach((key) => {
      if (x % key === 0) {
        hIndex = key;
      }
    });

    // only draw on configured tick marks.
    if (hIndex > -1) {
      ruler.addChild(new paper.Path(
        [drawX, pos.y],
        [drawX, pos.y + tickSizes[hIndex]]
      ));

      // Add a number on the centimeter delineation.
      if (hIndex === '10') {
        cncserver.api.actions.text(`${counter++}`, {
          point: [drawX - 3, pos.y + tickSizes[hIndex] + 2],
          size: [6, 3],
        });
      }
    }
  }

  cncserver.api.actions.strokePath(ruler.exportJSON());
  ruler.remove();
};


export default preview;
