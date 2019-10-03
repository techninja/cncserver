/**
 * @file Index for all ReSTful API endpoint handlers.
 */
/* eslint-disable global-require, import/no-dynamic-require */
module.exports = (cncserver) => {
  const modules = [{}, 'settings', 'pen', 'motors', 'buffer', 'tools', 'jobs'];

  return modules.reduce((acc, name) => ({
    ...acc,
    ...require(`./cncserver.api.${name}.js`)(cncserver),
  }));
};
