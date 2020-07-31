/**
 * @file Implement display element definition.
 */
import { html, svg } from '/modules/hybrids.js';

function renderImplement(host) {
  if (!host || !host.shadowRoot) return;
  const canvas = host.shadowRoot.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const {
    scale,
    handleHeight,
    bracketSize,
    bracketNotch,
    bracketPadding,

    // Implement specifics.
    handleWidth,
    width,
    length,
    type,
    stiffness,
    color,
  } = host;

  const handleColors = host.handleColors.split(',');

  let x;
  let y;

  const handle = {
    left: 40,
    top: 30,
    width: handleWidth * scale,
    height: handleHeight,
  };

  const brush = {
    width: width * scale,
    height: length * scale,
  };

  brush.top = handle.top + handle.height;
  brush.left = (handle.left + (handle.width / 2)) - brush.width / 2;

  // Draw Handle: |
  if (handleColors.length > 0) {
    const height = handle.height / handleColors.length;
    handleColors.forEach((cColor, index) => {
      ctx.fillStyle = cColor;
      ctx.fillRect(handle.left, handle.top + height * index, handle.width, height);
    });
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(handle.left, handle.top, handle.width, handle.height);
  }

  // Round and specular highlight.
  const penColor = ctx.createLinearGradient(handle.left, 0, handle.left + handle.width, 0);
  penColor.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  penColor.addColorStop(0.6, 'rgba(0, 0, 0, 0.3)');
  penColor.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
  penColor.addColorStop(0.8, 'rgba(0, 0, 0, 0.1)');
  penColor.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = penColor;
  ctx.fillRect(handle.left, handle.top, handle.width, handle.height);

  // Pen or brush.
  const center = brush.left + brush.width / 2;
  const largerWidth = brush.width > handle.width ? brush.width / 2 : handle.width / 2;
  const minLength = type === 'pen' ? 5 : 2;
  const drawLength = length < minLength ? minLength * scale : length * scale;
  if (type === 'pen') {
    // Draw a trapezoidal representation of the pen.
    y = handle.top + handle.height;
    ctx.beginPath();
    ctx.moveTo(handle.left, y);
    ctx.lineTo(handle.left + handle.width, y);
    ctx.lineTo(center + ((width * scale) / 2), y + drawLength);
    ctx.lineTo(center - ((width * scale) / 2), y + drawLength);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // Draw Brush: /
    // - We know where it starts (center bottom of handle)
    // - It should end the curve in a ratio from handle left less the brush width
    const curve = 1 - stiffness;
    const bendMax = 20;
    brush.height = drawLength - (curve * bendMax);
    //brush.height -= curve * bendMax;
    const maxDeflection = center - (handle.left - (width * scale));
    const deflectionLength = maxDeflection * curve;
    const curveEnd = center - deflectionLength;

    ctx.beginPath();
    ctx.moveTo(center, brush.top);
    ctx.bezierCurveTo(
      center, brush.top + (maxDeflection - deflectionLength), // First Control (Start)
      curveEnd + deflectionLength, brush.top + brush.height - (stiffness * bendMax), // Second Control (End)
      curveEnd, brush.top + brush.height // End Point.
    );
    ctx.lineWidth = width * scale;

    const brushColor = ctx.createLinearGradient(center, brush.top, curveEnd, brush.top + brush.height);
    brushColor.addColorStop('0', 'gray');
    brushColor.addColorStop('1', color);
    ctx.strokeStyle = brushColor;
    ctx.stroke();
  }

  // Draw Measures (1px black)
  ctx.fillStyle = 'black';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'black';

  // Only draw left and right measures with brush/other.
  if (type !== 'pen') {
    // Draw left measure: [
    x = center - largerWidth - bracketPadding;
    ctx.beginPath();
    ctx.moveTo(x, brush.top);
    ctx.lineTo(x - bracketSize, brush.top);
    ctx.lineTo(x - bracketSize, brush.top + brush.height);
    ctx.lineTo(x, brush.top + brush.height);

    // Notch.
    ctx.moveTo(x - bracketSize, brush.top + (brush.height / 2));
    ctx.lineTo(x - bracketSize - bracketNotch, brush.top + (brush.height / 2));
    ctx.textAlign = 'right';
    ctx.fillText(
      `${Math.round(stiffness * 100)}%`,
      x - bracketSize - bracketNotch - 2, brush.top + (brush.height / 2) + 3.5
    );
    ctx.stroke();

    // Draw right measure: ]
    x = center + largerWidth + bracketPadding;
    ctx.beginPath();
    ctx.moveTo(x, brush.top);
    ctx.lineTo(x + bracketSize, brush.top);
    ctx.lineTo(x + bracketSize, brush.top + brush.height);
    ctx.lineTo(x, brush.top + brush.height);

    // Notch.
    ctx.moveTo(x + bracketSize, brush.top + (brush.height / 2));
    ctx.lineTo(x + bracketSize + bracketNotch, brush.top + (brush.height / 2));
    ctx.textAlign = 'left';
    ctx.fillText(
      `${length}mm`,
      x + bracketSize + bracketNotch + 2, brush.top + (brush.height / 2) + 3.5
    );

    ctx.stroke();
  }

  // Draw top measure bracket:
  y = handle.top - bracketPadding;
  ctx.beginPath();
  ctx.moveTo(handle.left, y);
  ctx.lineTo(handle.left, y - bracketSize);
  ctx.lineTo(handle.left + handle.width, y - bracketSize);
  ctx.lineTo(handle.left + handle.width, y);

  // Notch.
  ctx.moveTo(handle.left + (handle.width / 2), y - bracketSize);
  ctx.lineTo(handle.left + (handle.width / 2), y - bracketSize - bracketNotch);
  ctx.textAlign = 'center';
  ctx.fillText(
    `${handleWidth}mm`,
    handle.left + (handle.width / 2), y - bracketSize - bracketNotch - 3.5
  );
  ctx.stroke();

  // Draw bottom measure bracket:
  y = brush.top + drawLength + bracketPadding;
  ctx.beginPath();
  ctx.moveTo(brush.left, y);
  ctx.lineTo(brush.left, y + bracketSize);
  ctx.lineTo(brush.left + brush.width, y + bracketSize);
  ctx.lineTo(brush.left + brush.width, y);

  // Notch.
  ctx.moveTo(brush.left + (brush.width / 2), y + bracketSize);
  ctx.lineTo(brush.left + (brush.width / 2), y + bracketSize + bracketNotch);
  ctx.textAlign = 'center';
  ctx.fillText(
    `${width}mm`,
    brush.left + (brush.width / 2), y + bracketSize + bracketNotch + 9
  );
  ctx.stroke();
}

function valueObserveFactory(defValue) {
  return {
    set: (host, value) => {
      // console.log('Value set...', value);
      renderImplement(host);
      return value;
    },
    connect: (host, key) => {
      if (host[key] === undefined) {
        host[key] = defValue;
      }
    },
  };
}

export default styles => ({
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
      left: 40,
      top: 30,
      width: handleWidth * scale,
      height: handleHeight,
    };

    const brush = {
      width: width * scale,
      height: length * scale,
    };

    const center = brush.left + brush.width / 2;
    const largerWidth = brush.width > handle.width ? brush.width / 2 : handle.width / 2;
    const minLength = type === 'pen' ? 5 : 2;
    const drawLength = length < minLength ? minLength * scale : length * scale;

    return html`
    ${styles}
    <style> :host { display: inline-block; } </style>
    <svg width="130" height="180">${svg`
      <style>
        .bracket { stroke:black; fill:none; }
        .label { font: 10px sans-serif; }
        .center { text-anchor: middle; }
        .left { text-anchor: end; }
        .right { text-anchor: start; }
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
      <g name="handle-width-bracket" transform="translate(${handle.left}, ${handle.top - bracketPadding})">
        <text class="label center" x="${handle.width / 2}" y="${-bracketSize - bracketPadding * 2}">${handleWidth}mm</text>
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
        <rect name="handle-color" width="${handleWidth * scale}" height="${handleHeight}" style="fill:${color}" />
        <rect name="handle-overlay" width="${handleWidth * scale}" height="${handleHeight}" style="fill:url(#handle)" />
      </g>
      ${type !== 'pen' && svg`
      <g name="brush-stiffness-bracket" transform="translate(${handle.left}, ${handle.top})">
        <path class="bracket" d="
          M0,0
        "/>
      </g>
      <g name="brush-length-bracket" transform="translate(${handle.left}, ${handle.top})">
        <path class="bracket" d="
          M
        "/>
      </g>
      `}
      <g name="brush-width-bracket" transform="translate(${handle.left}, ${handle.top})">
        <path class="bracket" d="
          M
        "/>
      </g>
    `}</svg>
  `;
  },
});
