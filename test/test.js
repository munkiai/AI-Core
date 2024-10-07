const request = require('supertest');
const app = require('./app'); // Ensure this is the path to your Express app

describe('Node.js Express API', () => {
  it('should return a 200 status for the root endpoint', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should return a 404 status for an unknown route', async () => {
    const res = await request(app).get('/unknown');
    expect(res.statusCode).toEqual(404);
  });
});
