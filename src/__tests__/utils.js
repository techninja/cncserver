const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { expect } = require('chai');

const cncPath = path.resolve(__dirname, '../../cncserver.js');

function createTestServer(args = []) {
  let watchInterval = null;
  let tries = 0;

  const child = spawn('node', [cncPath].concat(args), { stdio: 'pipe' });

  function shutdown() {
    child.kill();

    if (watchInterval) {
      clearInterval(watchInterval);
    }
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return new Promise(async (res, rej) => {
    const instance = axios.create({
      baseURL: 'http://localhost:4242',
    });
    // try to get a response from the server
    watchInterval = setInterval(async () => {
      try {
        await instance.get('/');

        clearInterval(watchInterval);
        res(child);
      } catch (e) {
        tries++;
        if (tries > 10) {
          shutdown();
          rej(
            'Could not start cncserver; max tries reached without a response'
          );
        }
      }
    }, 1000);
  });
}

async function makeRequests(instance, requests) {
  for (let i = 0; i < requests.length; i++) {
    const { request, response, assertion, description } = requests[i];
    const { data } = await instance(request);

    if (assertion) {
      // use the custom assertion method if available
      // this is usually when the data includes an array which would fail the default expect
      assertion(data, response.data, description);
    } else {
      // used for plain object comparison
      expect(data).deep.to.include(response.data, description);
    }
  }
}

module.exports = {
  createTestServer,
  makeRequests,
};
