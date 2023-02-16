const { describe, it, before, after } = require('node:test');
const axios = require('axios');

const { createTestServer, makeRequests } = require('./utils');
const requests = require('./requests');

const instance = axios.create({
  baseURL: 'http://localhost:4242',
});
let server;

describe('watercolorbot', () => {
  before(async () => {
    server = await createTestServer();
  });
  after(() => {
    server.kill();
  });
  it('works', async () => {
    await makeRequests(instance, requests.watercolorbot['/v1/settings']);
    await makeRequests(instance, requests.watercolorbot['/v1/buffer']);
    await makeRequests(instance, requests.watercolorbot['/v1/motors']);
    await makeRequests(instance, requests.watercolorbot['/v1/tools']);
    await makeRequests(instance, requests.watercolorbot['/v1/pen']);
  });
});
