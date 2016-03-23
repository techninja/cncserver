"use strict";

/**
 * @file Abstraction module for acceleration maths
 */

module.exports = function(cncserver) {
  cncserver.accel = {};

  cncserver.accel.getAccelCommands = function(src, dest) {
    var change = {
      x: Math.round(dest.x - src.x),
      y: Math.round(dest.y - src.y)
    };

    var distance = cncserver.utils.getVectorLength(change);

    var accelConf = cncserver.botConf.get('acceleration');

    var minSpeed = parseFloat(cncserver.botConf.get('speed:min'));
    var maxSpeed = parseFloat(cncserver.botConf.get('speed:max'));
    var drawingSpeed = cncserver.botConf.get('speed:drawing');
    var movingSpeed = cncserver.botConf.get('speed:moving');

    // Use given speed over distance to calculate duration
    var speedLimit = (cncserver.utils.penDown(src)) ? drawingSpeed : movingSpeed;
    speedLimit = parseFloat(speedLimit) / 100;
    speedLimit = (speedLimit * (maxSpeed - minSpeed) + minSpeed);

    // Sanity check speed value
    speedLimit = speedLimit > maxSpeed ? maxSpeed : speedLimit;
    speedLimit = speedLimit < minSpeed ? minSpeed : speedLimit;

    var ConstantVelMode = false;

    var timeSlice = parseFloat(accelConf.timeSlice);

    if (cncserver.utils.penDown(src)) {
      var accelRate = speedLimit / accelConf.accelTimePD;
    } else {
      var accelRate = speedLimit / accelConf.accelTimePU;
      if (distance < accelConf.shortThreshold) {
        accelRate = speedLimit / accelConf.accelTimePD;
        speedLimit = parseFloat(drawingSpeed) / 100;
      }
    }

    var tAccelMax = speedLimit / accelRate;
    var accelDistMax = ( 0.5 * accelRate * tAccelMax * tAccelMax );

    var durationArray = [];
    var distArray = [];
    var destArray1 = [];
    var destArray2 = [];

    var timeElapsed = 0;
    var position = 0;
    var velocity = 0;

    if (distance > (accelDistMax * 2 + timeSlice * speedLimit)) {
      // case 1 trapezoid
      var speedMax = speedLimit;

      var intervals = Math.floor(tAccelMax / timeSlice);

      var timePerInterval = tAccelMax / intervals;
      var velocityStepSize = (speedMax)/(intervals + 1.0);
      // For six time intervals of acceleration, first interval is at velocity (max/7)
      // 6th (last) time interval is at 6*max/7
      // after this interval, we are at full speed.

      // Calculate acceleration phase
      for (var i = 0; i < intervals; i++) {
        velocity += velocityStepSize;
        timeElapsed += timePerInterval;
        position += velocity * timePerInterval;
        durationArray.push(Math.round(timeElapsed * 1000))
        // Estimated distance along direction of travel
        distArray.push(position);
      }

      // Add a center "coasting" speed interval IF there is time for it.
      var coastingDistance = distance - (accelDistMax * 2);

      if (coastingDistance > (timeSlice * speedMax)) {
        // There is enough time for (at least) one interval at full cruising speed.
        velocity = speedMax;
        var cruisingTime = coastingDistance / velocity;
        timeElapsed += cruisingTime;
        durationArray.push(Math.round(timeElapsed * 1000.0));
        position += velocity * cruisingTime;
        // Estimated distance along direction of travel
        distArray.push(position);
      }

      // Calculate deceleration phase
      for (var i = 0; i < intervals; i++) {
        velocity -= velocityStepSize;
        timeElapsed += timePerInterval;
        position += velocity * timePerInterval;
        durationArray.push(Math.round(timeElapsed * 1000))
        // Estimated distance along direction of travel
        distArray.push(position);
      }
    } else {
      // Case 3 triangle

      var Ta = (Math.sqrt(4 * accelRate * distance)) / (2 * accelRate);
      var Vmax = accelRate * Ta;
      var intervals = Math.floor(Ta / timeSlice);

      if (intervals === 0) {
        Ta = 0;
      }

      if (intervals * 2 > 4) {
        if (intervals > 0) {
          var timePerInterval = Ta / intervals;
          var velocityStepSize = Vmax / (intervals + 1);
          // For six time intervals of acceleration, first interval is at velocity (max/7)
          // 6th (last) time interval is at 6*max/7
          // after this interval, we are at full speed.

          // Calculate acceleration phase
          for (var i = 0; i < intervals; i++) {
            velocity += velocityStepSize;
            timeElapsed += timePerInterval;
            position += velocity * timePerInterval;
            durationArray.push(Math.round(timeElapsed * 1000))
            // Estimated distance along direction of travel
            distArray.push(position);
          }
          // Calculate deceleration phase
          for (var i = 0; i < intervals; i++) {
            velocity -= velocityStepSize;
            timeElapsed += timePerInterval;
            position += velocity * timePerInterval;
            durationArray.push(Math.round(timeElapsed * 1000))
            // Estimated distance along direction of travel
            distArray.push(position);
          }
        }
      } else {
        // Case 2 linear or constant velocity changes
        // TODO: this accel type currently may not make sense

        var initalVel = Vmax / 2;
        velocity = initialVel;
        // 0 is the final velocity
        var localAccel = (0 - initialVel * initialVel) / (2.0 * distance);
        if (localAccel > accelRate) {
          localAccel = accelRate;
        } else if (localAccel < -accelRate) {
          localAccel = -accelRate;
        }
        if (localAccel === 0) {
          ConstantVelMode = True;
        } else {
          var tSegment = (-initialVel) / localAccel;
        }

        intervals = Math.floor(tSegment / timeSlice);
        if (intervals > 1) {
          var timePerInterval = tSegment / intervals;
          var velocityStepSize = (0 - initialVel) / (intervals + 1);

          // Calculate acceleration phase
          for (var i = 0; i < intervals; i++) {
            velocity += velocityStepSize;
            timeElapsed += timePerInterval;
            position += velocity * timePerInterval;
            durationArray.push(Math.round(timeElapsed * 1000))
            // Estimated distance along direction of travel
            distArray.push(position);
          }
        } else {
          initialVel = Vmax;
          ConstantVelMode = True;
        }
      }
    }

    if (ConstantVelMode) {
      // case 4 constant velocity mode

      if (0 > initialVel) {
        velocity = 0;
      } else if (initalVel > 0) {
        velocity = finalVel;
      } else if (initialVel > 0) {
        // Allow case of two are equal, but nonzero
        velocity = initialVel;
      } else {
        velocity = speedLimit * 0.5
      }

      timeElapsed = distance / velocity;
      durationArray.push(Math.round(timeElapsed * 1000));
      distArray.push(distance);
      position += distance;
    }

    // Make commands from distance and duration arrays

    var prevMotor1 = 0;
    var prevMotor2 = 0;
    var prevTime = 0;

    var moveCommands = [];

    for (var i = 0; i < distArray.length; i++) {
      var fractionalDistance = distArray[i] / position;
      destArray1.push(Math.round(change.x * fractionalDistance));
      destArray2.push(Math.round(change.y * fractionalDistance));
    }

    for (var i = 0; i < destArray1.length; i++) {
      var moveSteps1 = destArray1[i] - prevMotor1;
      var moveSteps2 = destArray2[i] - prevMotor2;
      var moveTime = durationArray[i] - prevTime;
      prevTime = durationArray[i];

      if (moveTime < 1) {
        moveTime = 1;
      }

      if (Math.abs(moveSteps1 / moveTime) < 0.002) {
        moveSteps1 = 0;
      }
      if (Math.abs(moveSteps2 / moveTime) < 0.002) {
        moveSteps2 = 0;
      }

      prevMotor1 += moveSteps1;
      prevMotor2 += moveSteps2;

      if (moveSteps1 !== 0 || moveSteps2 !== 0) {
        moveSteps1 = cncserver.gConf.get('invertAxis:x') ? moveSteps1 * -1 : moveSteps1;
        moveSteps2 = cncserver.gConf.get('invertAxis:y') ? moveSteps2 * -1 : moveSteps2;

        moveCommands.push({x: moveSteps1, y: moveSteps2, d: moveTime});
      }
    }
    return moveCommands;
  };
};
