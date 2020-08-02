/**
 * @file Implement display element definition.
 */
import { html, svg } from '/modules/hybrids.js';

export default () => ({
  // UI configuration specifics.
  scale: 4.5,
  handleHeight: 40,
  bracketSize: 8,
  bracketNotch: 5,
  bracketPadding: 5,

  // Implement specifics.
  handleColors: 'yellow',
  handleWidth: 10,
  width: 1,
  length: 0,
  type: 'pen',
  stiffness: 1,
  color: '#000000',

  render: ({
    scale,
    handleHeight,
    bracketSize,
    bracketNotch,
    bracketPadding,

    // Implement specifics.
    handleColors,
    handleWidth,
    width,
    length,
    type,
    stiffness,
    color,
  }) => {
    const handle = {
      left: 50,
      top: 30,
      width: handleWidth * scale,
      height: handleHeight,
    };

    const brush = {
      width: width * scale,
      height: length * scale,
      top: handle.top + handle.height,
      left: handle.left + handle.width / 2 - (width * scale) / 2,
    };

    const center = brush.left + brush.width / 2;
    const largerWidth = brush.width > handle.width ? brush.width / 2 : handle.width / 2;
    const minLength = type === 'pen' ? 5 : 2;
    const drawLength = length < minLength ? minLength * scale : length * scale;
    handleColors = handleColors.split(',');

    const curve = 1 - stiffness;
    const bendMax = 15;

    let brushShape = '';

    if (type === 'pen') {
      // Draw a trapezoidal representation of the pen.
      brushShape = `
        M0,0
        l${handle.width},0
        l${-handle.width / 2 + (width * scale) / 2},${drawLength}
        l${-width * scale},0
      `;
    } else {
      brush.height = drawLength - (curve * bendMax);

      // Position of start control point.
      const startBend = {
        // No x offset ensures straight down bristles.
        x: 0,

        // Pushes bristles down by this amount.
        y: ((length * scale) / 2) * curve,
      };

      // Relative position of tip from top/center.
      const tip = {
        x: -(handle.width / 2) * curve - 0.1,
        y: brush.height,
      };

      // Position of end control point that controls bezier bend.
      const bend = {
        // Position of tip, bent to the right depending on stiffness.
        x: tip.x + ((length * scale) / 2) * curve,

        // Position of tip, less proportional to the curve to angle properly.
        y: tip.y - (((length * scale) / 4) * stiffness),
      };

      // Draw a brush shape.
      brushShape = `
        M${handle.width / 2},0
        c
          ${startBend.x}, ${startBend.y}
          ${bend.x}, ${bend.y}
          ${tip.x}, ${tip.y}
      `;
    }

    // Setup the bracket attribute values.
    const brackets = {
      top: {
        transform: `translate(${handle.left}, ${handle.top - bracketPadding})`,
        d: `M0,0
            l0,${-bracketSize}
            l${handle.width},0
            l0,${bracketSize}
            m${-handle.width / 2},${-bracketSize}
            l0,${-bracketNotch}`,
      },
      left: {
        transform: `translate(${center - largerWidth - bracketPadding}, ${brush.top})`,
        d: `M0,0
            l${-bracketSize},0
            l0,${brush.height}
            l${bracketSize},0
            m${-bracketSize},${-brush.height / 2}
            l${-bracketNotch},0`,
      },
      right: {
        transform: `translate(${center + largerWidth + bracketPadding}, ${brush.top})`,
        d: `M0,0
            l${bracketSize},0
            l0,${brush.height}
            l${-bracketSize},0
            m${bracketSize},${-brush.height / 2}
            l${bracketNotch},0`,
      },
      bottom: {
        transform: `translate(${brush.left}, ${brush.top + drawLength + bracketPadding})`,
        d: `M0,0
            l0,${bracketSize}
            l${brush.width},0
            l0,${-bracketSize}
            m${-brush.width / 2},${bracketSize}
            l0,${bracketNotch}`,
      },
    };

    return html`
      <style>
        :host {
          display: inline-block;
        }
      </style>
      <svg width="160" height="220">
        ${svg`
      <style>
        .bracket { stroke:black; fill:none; }
        .label { font: 10px sans-serif; }
        .center { text-anchor: middle; }
        .left { text-anchor: end; }
        .right { text-anchor: start; }
        .other, .brush { stroke: url(#brush); stroke-width: ${width * scale}; fill:none;}
        .pen { stroke: none; fill: ${color} }
      </style>
      <defs>
        <linearGradient id="handle" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0" style="stop-color:rgba(0, 0, 0, 0.7)" />
          <stop offset="60%" style="stop-color:rgba(0, 0, 0, 0.3)" />
          <stop offset="70%" style="stop-color:rgba(255, 255, 255, 1)" />
          <stop offset="80%" style="stop-color:rgba(0, 0, 0, 0.1)" />
          <stop offset="100%" style="stop-color:rgba(0, 0, 0, 0)" />
        </linearGradient>
        <linearGradient id="brush" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0" style="stop-color:gray" />
          <stop offset="100%" style="stop-color:${color}" />
        </linearGradient>
      </defs>
      <g name="handle-width-bracket" transform="${brackets.top.transform}">
        <text class="label center"
          x="${handle.width / 2}"
          y="${-bracketSize - bracketPadding - 2}"
        >
          ${handleWidth}mm
        </text>
        <path class="bracket" d="${brackets.top.d}"/>
      </g>
      <g name="handle" transform="translate(${handle.left}, ${handle.top})">
        ${handleColors.map((handleColor, index) => svg`
        <rect name="handle-color"
          width=${handleWidth * scale}
          height=${handle.height / handleColors.length}
          y=${(handle.height / handleColors.length) * index}
          style="fill:${handleColor}"
        />
        `)}
        <rect name="handle-overlay"
          width=${handleWidth * scale}
          height=${handleHeight}
          style="fill:url(#handle)"
        />
      </g>
      <path name="brush" class=${type} d=${brushShape}
        transform="translate(${handle.left}, ${brush.top})"
      />
      ${type !== 'pen' && svg`
      <g name="brush-stiffness-bracket" transform="${brackets.left.transform}">
        <text class="label left"
          x="${-bracketPadding * 2 - bracketNotch}"
          y="${brush.height / 2 + 4}">
            ${Math.round(stiffness * 100)}%
        </text>
        <path class="bracket" d="${brackets.left.d}"/>
      </g>
      <g name="brush-length-bracket" transform="${brackets.right.transform}">
        <text class="label right"
          x="${bracketSize + bracketNotch * 2}"
          y="${brush.height / 2 + 3}"
        >
          ${length}mm
        </text>
        <path class="bracket" d="${brackets.right.d}"/>
      </g>`}
      <g name="brush-width-bracket" transform="${brackets.bottom.transform}">
        <text class="label center"
          x="${brush.width / 2}"
          y="${bracketSize + bracketPadding * 3}"
        >
          ${width}mm
        </text>
        <path class="bracket" d="${brackets.bottom.d}"/>
      </g>
    `}
      </svg>
    `;
  },
});
