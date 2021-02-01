/**
 * @file Code for image vectorizor management.
 */
import path from 'path';
import spawner from 'cs/drawing/spawner';
import { renderGroup } from 'cs/content';
import { addJSON } from 'cs/drawing/temp';
import { __basedir } from 'cs/utils';

export default function vectorize(imagePath, hash, bounds, settings) {
  return new Promise((success, error) => {
    const { method } = settings.vectorize;
    const script = path.resolve(
      __basedir,
      'components',
      'core',
      'drawing',
      'vectorizers',
      method,
      `cncserver.drawing.vectorizers.${method}.js`
    );

    // Use spawner to run vectorizer process.
    spawner({
      type: 'vectorizer',
      hash,
      script,
      settings: { ...settings.vectorize, bounds },
      object: imagePath,
    }).then(result => {
      // Because some vectorizers produce filled shapes, we need to process
      // these in the temp layer before moving them to render preview.
      const group = addJSON(result, hash);

      console.log('Returned items', group.children[0].children.length);

      // We'll NEVER have occlusion if converting a raster to a vector.
      renderGroup(group, hash, settings, true);
      success();
    }).catch(error);
  });
}
