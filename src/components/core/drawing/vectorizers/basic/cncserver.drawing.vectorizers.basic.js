/**
 * @file Basic vectorizer using autotrace.
 */

const { Group, CompoundPath, Color } = require('paper');
const { exec } = require('child_process');
const { tmpdir } = require('os');
const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const util = require('../cncserver.drawing.vectorizers.util');

const { JSDOM } = jsdom;
const bin = path.resolve(__dirname, 'bin', process.platform, 'autotrace');
const tmp = path.resolve(tmpdir());
const outputFile = path.resolve(tmp, `autotrace_output_${util.info.hash}.svg`);

let settings = { }; // Globalize contents of filler.vectorize >

// Map settings values to verbose command line options.
const optionMap = {
  centerline: 'centerline',
};

// Static Autotrace settings.
const optionStatic = [
  '--output-format=svg',
];

const buildOptions = () => {
  // Add static options.
  const opts = [...optionStatic];

  // Mesh in settings direct mapped options.
  Object.entries(optionMap).forEach(([key, optName]) => {
    if (typeof settings.basic[key] === 'boolean') {
      if (settings.basic[key]) {
        opts.push(`--${optName}`); // Option boolean
      }
    } else {
      opts.push(`--${optName}=${settings.basic[key]}`); // Option -> Value
    }
  });

  // Convert raster flatten color to the uppercase HEX string autotrace needs.
  const transColor = new Color(settings.raster.flattenColor)
    .toCSS(true)
    .replace('#', '')
    .toUpperCase();

  // Add in special cases.
  opts.push(`--background-color=${transColor}`);
  opts.push(`--color-count=${settings.basic.colors + 1}`);
  opts.push(`--despeckle-level=${settings.basic.cleanup.level}`);
  opts.push(`--despeckle-tightness=${settings.basic.cleanup.tightness}`);
  opts.push(`--output-file=${outputFile}`);

  return opts;
};

// Connect to the main process, start the vectorization operation.
util.connect('bmp', (inputImagePath, rawSettings) => {
  settings = { ...rawSettings };

  // Remove any previous run output file.
  if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

  const opts = buildOptions();
  const fullExec = `${bin} ${inputImagePath} ${opts.join(' ')}`;
  // console.log('Executing:', fullExec);

  const child = exec(fullExec);

  child.stderr.on('data', (data) => {
    console.log('ERROR:', data);
  });

  child.stdout.on('data', (data) => {
    console.log('Output:', data);
  });

  child.on('close', () => {
    if (fs.existsSync(outputFile)) {
      const exportGroup = new Group();
      console.log('Importing file', outputFile);

      // TODO: Paper refuses to import SVG?! Parse it ourselves.
      const svg = fs.readFileSync(outputFile, 'utf8');
      const dom = new JSDOM(svg, { contentType: 'text/xml' });
      const paths = dom.window.document.querySelectorAll('path');
      paths.forEach((pathItem) => {
        const styleParts = pathItem.getAttribute('style').split(';');
        const styles = { fill: null, stroke: null };
        styleParts.forEach((item) => {
          const part = item.split(':');
          styles[part[0]] = part[1];
        });

        exportGroup.addChild(
          new CompoundPath({
            pathData: pathItem.getAttribute('d'),
            fillColor: styles.fill,
            strokeColor: styles.stroke,
            strokeWeight: styles.stroke === 'none' ? null : 1,
          })
        );
      });

      exportGroup.fitBounds(settings.bounds);
      util.finish(exportGroup);
    } else {
      console.log('No output file 😢', outputFile);
      util.finish(new Group());
    }
  });
});
