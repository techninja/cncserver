/**
 * @file Holds util functions.
 */
/* eslint-env browser */
/* globals cncserver, $, paper, cstate */
const utils = {};

utils.paperToMove = ([x, y]) => ({
  x, y, abs: 'mm',
});

utils.stepsToPaper = ({ x, y }) => [x / cstate.stepsPerMM.x, y / cstate.stepsPerMM.y];

export default utils;
