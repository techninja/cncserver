/**
 * @file Color set/preset display element definition.
 */
import { html, svg } from '/modules/hybrids.js';

export default () => ({
  colors: 'black',
  labels: 'Black',
  display: 'round', // 'round', or 'line'.
  width: 55,

  render: ({ colors, labels, width, display }) => {
    colors = colors.split(',');
    labels = labels.split(',');

    const spots = [];
    let spotWidth = 0;
    if (display === 'round') {
      // Build out positions on a circle.
      const radius = width / 2;
      spotWidth = colors.length === 1 ? radius : radius * ((Math.PI * 2) / colors.length);
      colors.forEach((color, index) => {
        const angle = (Math.PI * 2) * (index / colors.length) - Math.PI;

        const x = Math.round(Math.cos(angle) * radius);
        const y = Math.round(Math.sin(angle) * radius);
        const style = {
          backgroundColor: color,
          left: `${x + radius - spotWidth / 2}px`,
          top: `${y + radius - spotWidth / 2}px`,
        };

        spots.push(html`
          <div class="spot" style=${style} title=${labels[index]}></div>
        `);
      });
    } else if (display === 'line') {
      spotWidth = width / colors.length;
      colors.forEach((color, index) => {
        const style = { backgroundColor: color };
        spots.push(html`
          <div class="spot-line" style=${style} title=${labels[index]}></div>
        `);
      });
    }

    return html`
      <style>
        :host {
          display: inline-block;
        }

        .wrapper-round {
          position: relative;
          width: ${width}px;
          height: ${width}px;
          margin: ${spotWidth / 2}px;
        }

        .display-round {
          width: ${width}px;
          height: ${width}px;
          margin: ${spotWidth / 2}px;
          position: absolute;
          top: 0;
          z-index: -1;
        }

        .display-line {
          width: ${width}px;
          display: flex;
          z-index: -1;
        }

        .spot {
          width: ${spotWidth}px;
          height: ${spotWidth}px;
          border-radius: ${spotWidth / 2}px;
          position: absolute;
          content: " ";
        }

        .spot-line {
          width: ${spotWidth}px;
          height: 20px;
          display: block;
          transform: skew(-20deg);
          content: " ";
        }

        slot > * {
          position: absolute;
          z-index: 1;
        }
      </style>
      <div class=${`wrapper-${display}`}>
        <slot></slot>
        <div class=${`display-${display}`}>
          ${spots.map(spot => spot)}
        </div>
      </div>
    `;
  },
});
