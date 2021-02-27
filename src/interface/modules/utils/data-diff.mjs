/**
 * @file Util to get only the differences between two objects.
 */
/* globals _ */

/**
 * Get only the parts that are different from a complete/deep JSON object.
 *
 * @param {object} object
 *   Input object to check for diff against the base.
 * @param {object} base
 *   Base object to diff against the input.
 *
 * @returns {object}
 *   Only the differences between the two objects in full tree form.
 */
function dataDiff(object, base = {}) {
  const result = _.pick(
    _.mapObject(object, (value, key) => (
      // eslint-disable-next-line no-nested-ternary
      (!_.isEqual(value, base[key]))
        // eslint-disable-next-line max-len
        ? ((_.isObject(value) && _.isObject(base[key])) ? dataDiff(value, base[key]) : value)
        : null
    )),
    value => (value !== null)
  );

  // Trim out empty keys
  const entries = Object.entries(result);
  entries.forEach(([key, val]) => {
    if (typeof val === 'object' && Object.keys(val).length === 0) {
      delete result[key];
    } else if (val === undefined) {
      delete result[key];
    }
  });

  // TODO: Trim deeper changed objects.
  return result;
}

export default dataDiff;
