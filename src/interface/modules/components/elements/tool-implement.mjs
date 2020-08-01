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


    const curve = 1 - stiffness;
    const bendMax = 20;
    const maxDeflection = handle.left - (width * scale);
    const deflectionLength = maxDeflection * curve;
    const curveEnd = center - deflectionLength;

    let brushShape = '';
    let y;
    let x;

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

      // Draw a brush shape.
      brushShape = `
        M${handle.width / 2},0
        c
          0, ${maxDeflection - deflectionLength}
          ${deflectionLength}, ${brush.height - (stiffness * bendMax)}
          ${-handle.width / 2 + deflectionLength}, ${brush.height}
      `;
    }

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
        .other, .brush { stroke: ${color}; stroke-width: ${width * scale}; fill:none;}
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
      </defs>
      <g name="handle-width-bracket"
        transform="translate(${handle.left}, ${handle.top - bracketPadding})
      ">
        <text class="label center"
          x="${handle.width / 2}"
          y="${-bracketSize - bracketPadding * 2}"
        >
          ${handleWidth}mm
        </text>
        <path class="bracket" d="
          M0,0
          l0,${-bracketSize}
          l${handle.width},0
          l0,${bracketSize}
          m${-handle.width / 2},${-bracketSize}
          l0,${-bracketNotch}
        "/>
      </g>
      <g name="handle" transform="translate(${handle.left}, ${handle.top})">
        <rect name="handle-color"
          width=${handleWidth * scale}
          height=${handleHeight}
          style="fill:${color}"
        />
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
      <g name="brush-stiffness-bracket"
        transform="translate(
          ${center - largerWidth - bracketPadding}, ${brush.top}
        )">
        <text class="label left"
          x="${-bracketPadding * 2 - bracketNotch}"
          y="${brush.height / 2 + 4}">
            ${Math.round(stiffness * 100)}%
        </text>
        <path class="bracket" d="
          M0,0
          l${-bracketSize},0
          l0,${brush.height}
          l${bracketSize},0
          m${-bracketSize},${-brush.height / 2}
          l${-bracketNotch},0
        "/>
      </g>
      <g name="brush-length-bracket"
        transform="translate(
          ${center + largerWidth + bracketPadding}, ${brush.top}
        )"
      >
        <text class="label right"
          x="${bracketSize + bracketNotch * 2}"
          y="${brush.height / 2 + 3}"
        >
          ${length}mm
        </text>
        <path class="bracket" d="
          M0,0
          l${bracketSize},0
          l0,${brush.height}
          l${-bracketSize},0
          m${bracketSize},${-brush.height / 2}
          l${bracketNotch},0
        "/>
      </g>`}
      <g name="brush-width-bracket" transform="translate(${brush.left}, ${brush.top + brush.height + bracketPadding})">
        <text class="label center"
          x="${brush.width / 2}"
          y="${bracketSize + bracketPadding * 3}"
        >
          ${width}mm
        </text>
        <path class="bracket" d="
          M0,0
          l0,${bracketSize}
          l${brush.width},0
          l0,${-bracketSize}
          m${-brush.width / 2},${bracketSize}
          l0,${bracketNotch}
        "/>
      </g>
    `}
      </svg>
    `;
  },
});
