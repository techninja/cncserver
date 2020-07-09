/**
 * @file Code for determining path drawing accelleration planning.
 */
const zodiac = require('zodiac-ts');

// Conglomerated feature export.
const accell = { id: 'drawing.accell', state: 'idle' };

// Path planning Settings
const s = {
  accelRate: 25, // 10, // Percentage increase over distance.
  speedMultiplyer: 0.75, // 0.55 // Conversion of moment length to velocity.
  minSpeed: 15, // 5,
  resolution: 0.5, // Steps to check along path by
  maxDeflection: 10, // 5,
  // Time before work is sent to the callback for long operations.
  splitTimeout: 2500,
};

// Path planning:
// 1. Step along the path moving a vector
// 2. Increase vector length (speed) by accelRate (max 100)
// 3. Decrease vector length to fit curvature over time.

// Accel Vector
let speed = 0; // Always start at 0.

function getAngleDiff(target, source) {
  return Math.abs(source - target) % 360;
}

function getCurvatureBetween(path, from, to, curvatureThreshold) {
  const res = s.resolution;
  let maxPointDistance = null;

  if (from >= path.length) {
    return { curvature: 90, maxPointDistance: 0 };
  }

  // CLone the working path into memory.
  let p = path.clone({ insert: false });


  // Split the path at the from and to locations.
  p = p.splitAt(from); // Returns the part after from.

  // Is the result valid? If not, return immediately.
  if (!p) {
    return { curvature: 90, maxPointDistance: 0 };
  }

  const garbage = p.splitAt(to - from); // We can throw away the result after to.
  if (garbage) {
    garbage.remove();
  }

  // Flatten the path section into segments
  p.flatten(res);

  const len = p.segments.length;

  // Have we reached the end of the line?
  if (len === 1 || to >= path.length) {
    return { curvature: 90, maxPointDistance: path.length - from };
  }

  const startVector = p.segments[1].point.subtract(p.segments[0].point);
  let lastPoint;

  // Find the distance from start where the curvatureThreshold is reached.
  for (let pos = 0; pos < (to - from); pos += res) {
    if (pos !== 0) {
      const checkPoint = p.getPointAt(pos);
      if (checkPoint) {
        const checkVector = checkPoint.subtract(lastPoint);
        const angleDiff = getAngleDiff(startVector.angle, checkVector.angle);

        if (angleDiff > curvatureThreshold && !maxPointDistance) {
          maxPointDistance = pos;
          // console.log(Math.round(to - from), Math.round(pos), angleDiff);
        }
      }
    }
    lastPoint = p.getPointAt(pos);
  }

  const endVector = p.segments[len - 1].point.subtract(p.segments[len - 2].point);

  p.remove();
  return { curvature: startVector.getDirectedAngle(endVector), maxPointDistance };
}


function stepCalc(path, inputOffset) {
  if (inputOffset > path.length) {
    return null;
  }


  let offset = inputOffset;
  if (inputOffset < 0) {
    offset = 0;
    speed = 0;
  }

  const point = path.getPointAt(offset);
  const tangent = path.getTangentAt(offset);

  // If we're at the start, speed is always 0.
  if (offset === 0) {
    return { point, tangent, speed: 0 };
  }

  tangent.length = Math.max(speed * s.speedMultiplyer, s.minSpeed);
  const lookAhead = getCurvatureBetween(
    path,
    offset,
    offset + tangent.length,
    s.maxDeflection
  );

  if (lookAhead.maxPointDistance) {
    tangent.length = Math.max(lookAhead.maxPointDistance, s.minSpeed);
    speed = lookAhead.maxPointDistance / s.speedMultiplyer;
  } else {
    speed += s.accelRate * s.resolution;
  }

  // Sanity check speed min/max.
  speed = speed < 0 ? 0 : speed;
  speed = speed > 100 ? 100 : speed;

  return { point, tangent, speed };
}

module.exports = (cncserver, drawing) => {
  function getSmoothed(vals, rawResults) {
    const results = rawResults;
    try {
      const alpha = 0.3;
      const ses = new zodiac.SimpleExponentialSmoothing(vals, alpha);
      const forecast = ses.predict(0);

      // Repair forecast ends, always start/end on 0.
      forecast.pop();
      /*
      forecast[0] = 0;
      forecast[forecast.length - 1] = 0;
      */

      // Reinsert smoothed values back to results.
      forecast.forEach((smoothedSpeed, index) => {
        results[index].speed = Math.round(smoothedSpeed * 10) / 10;
      });
    } catch (error) {
      // Oh well.
    }

    return results;
  }

  // Allow external cancelling of accell process.
  accell.cancel = () => {
    accell.state = 'idle';
  };

  // Bind to Cancel.
  cncserver.binder.bindTo('buffer.clear', accell.id, accell.cancel);

  // SYNC - Get and return a list of accell points directly.
  // WARNING: Will entirely block event loop on long paths.
  accell.getPointsSync = (path) => {
    // Accell should only be doing work on one path at a time.
    if (accell.state !== 'idle') {
      throw new Error('Can only accell one path at a time.');
    }

    accell.state = 'processing';
    const results = [];
    const vals = [];
    const traverseLength = path.length + s.resolution;

    // Reset speed follow soft global.
    speed = 0;
    for (let offset = 0; offset <= traverseLength; offset += s.resolution) {
      const v = stepCalc(path, offset);
      if (v) {
        vals.push(v.speed);
        results.push(v);
      }
    }

    accell.state = 'idle';
    return getSmoothed(vals, results);
  };

  // ASYNC - Get a list of accelleration points, splitting the work up into batches.
  accell.getPoints = (path, resultCallback) => {
    // Accell should only be doing work on one path at a time.
    if (accell.state !== 'idle') {
      throw new Error('Can only accell one path at a time.');
    }

    speed = 0; // Reset speed follow soft global.

    let splitTimer = new Date();
    const results = [];
    const vals = [];
    const traverseLength = path.length + s.resolution;
    accell.state = 'processing';

    // Start range of where to return results.
    let returnResultIndex = 0;

    let offset = 0;
    const nextOffset = () => {
      // If the state changes here then processing has been canceled.
      if (accell.state === 'idle') {
        resultCallback(null);
        return;
      }

      // Process along the offset in the path.
      if (offset <= traverseLength) {
        const v = stepCalc(path, offset);
        if (v) {
          vals.push(v.speed);
          results.push(v);
        }

        // Is this taking too long? Split the work up.
        if (new Date() - splitTimer > s.splitTimeout) {
          resultCallback(
            getSmoothed(vals, results).slice(returnResultIndex)
          );
          returnResultIndex = vals.length;
          splitTimer = new Date();
        }
        offset += s.resolution;
        setTimeout(nextOffset, 0);
      } else {
        accell.state = 'idle';

        // We're completely done with the path.
        resultCallback(
          getSmoothed(vals, results).slice(returnResultIndex)
        );
        resultCallback([]);
      }
    };

    // Initialize getting the first offset.
    setTimeout(nextOffset, 0);
  };

  return accell;
};
