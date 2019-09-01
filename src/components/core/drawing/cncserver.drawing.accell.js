/**
 * @file Code for determining path drawing accelleration planning.
 */
const zodiac = require('zodiac-ts');
const fs = require('fs');

// Path planning Settings
const s = {
  accelRate: 8, // Percentage increase over distance.
  speedMultiplyer: 0.8, // Conversion of moment length to speed.
  minSpeed: 5,
  resolution: 1, // Steps to check along path by
  maxDeflection: 10,
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
  const garbage = p.splitAt(to - from); // We can throw away the result after to.
  garbage.remove();

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
  const accell = (path) => {
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

    // fs.writeFileSync('results.txt', vals.join('\n'));

    try {
      const alpha = 0.3;
      const ses = new zodiac.SimpleExponentialSmoothing(vals, alpha);
      const forecast = ses.predict(0);
      // Repair forecast ends, always start/end on 0.
      forecast.pop();
      forecast[0] = 0;
      forecast[forecast.length - 1] = 0;

      // Reinsert smoothed values back to results.
      forecast.forEach((smoothedSpeed, index) => {
        results[index].speed = Math.round(smoothedSpeed * 10) / 10;
      });

      // fs.writeFileSync('results.txt', vals.join('\n'));
      // fs.writeFileSync('smoothed.txt', forecast.join('\n'));
    } catch (error) {
      // Oh well.
    }


    return results;
  };

  return accell;
};
