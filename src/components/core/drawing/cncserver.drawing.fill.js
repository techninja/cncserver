/**
 * @file Code for drawing fill management.
 */
import path from 'path';
import { fitBounds } from 'cs/drawing/base';
import spawner from 'cs/drawing/spawner';
import { addRenderJSON } from 'cs/drawing/preview';
import { __basedir } from 'cs/utils';

export default function fill(
  fillPath, hash, bounds = null, settings, subIndex
) {
  return new Promise((success, error) => {
    const { method } = settings;
    const script = path.resolve(
      __basedir,
      'src',
      'components',
      'core',
      'drawing',
      'fillers',
      method,
      `cncserver.drawing.fillers.${method}.js`
    );

    // Add in computed settings values here.
    if (settings.randomizeRotation) {
      settings.rotation = Math.round(Math.random() * 360);
    }

    // TODO: Should we fitbounds here? Or earlier?
    if (bounds) {
      fitBounds(fillPath, bounds);
    }

    // Use spawner to run fill process.
    spawner({
      type: 'filler',
      hash,
      script,
      settings,
      object: fillPath.exportJSON(),
      subIndex,
    }).then(result => {
      addRenderJSON(result, hash, {
        fillColor: null,
        strokeWidth: 1,
        strokeColor: fillPath.fillColor,
      });
      success();
    }).catch(error);
  });
}
