/**
 * Unit tests for API endpoints
 */
const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

// Mock dependencies
jest.mock('../../src/config/db');
jest.mock('../../src/config/rabbitmq');

const reportsController = require('../../src/api/controllers/reportsController');
const db = require('../../src/config/db');
const { getChannel } = require('../../src/config/rabbitmq');

// Setup Express app for testing
const app = express();
app.use(bodyParser.json());
app.post('/api/reports/generate', reportsController.generateReport);
app.get('/api/reports/:id/status', reportsController.getReportStatus);

describe('API Endpoints Unit Tests', () => {
  let mockChannel;

  beforeEach(() => {
    // Setup mocks
    mockChannel = {
      publish: jest.fn(),
      sendToQueue: jest.fn()
    };
    getChannel.mockReturnValue(mockChannel);
    jest.clearAllMocks();
  });

  describe('POST /api/reports/generate', () => {
    test('should return 202 with valid request', (done) => {
      db.query = jest.fn((query, values, callback) => {
        callback(null, { insertId: 1 });
      });

      request(app)
        .post('/api/reports/generate')
        .send({
          report_type: 'sales_summary',
          parameters: {
            startDate: '2023-01-01',
            endDate: '2023-03-31'
          }
        })
        .expect(202)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).toHaveProperty('report_id');
          expect(res.body.status).toBe('pending');
          expect(res.body.message).toBe('Report generation initiated.');
          expect(mockChannel.publish).toHaveBeenCalled();
          done();
        });
    });

    test('should return 400 when report_type is missing', (done) => {
      request(app)
        .post('/api/reports/generate')
        .send({
          parameters: { startDate: '2023-01-01' }
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toContain('report_type');
          done();
        });
    });

    test('should return 400 when report_type is not a string', (done) => {
      request(app)
        .post('/api/reports/generate')
        .send({
          report_type: 123,
          parameters: {}
        })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toContain('report_type');
          done();
        });
    });

    test('should return 500 on database error', (done) => {
      db.query = jest.fn((query, values, callback) => {
        callback(new Error('Database connection failed'), null);
      });

      request(app)
        .post('/api/reports/generate')
        .send({
          report_type: 'sales_summary',
          parameters: {}
        })
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toBe('Database error');
          done();
        });
    });
  });

  describe('GET /api/reports/:id/status', () => {
    test('should return 200 with valid report_id', (done) => {
      const mockReport = {
        id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        status: 'completed',
        generated_url: 'http://reports.example.com/test.pdf',
        failure_reason: null,
        retry_count: 0
      };

      db.query = jest.fn((query, values, callback) => {
        callback(null, [mockReport]);
      });

      request(app)
        .get('/api/reports/d290f1ee-6c54-4b01-90e6-d701748f0851/status')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.report_id).toBe(mockReport.id);
          expect(res.body.status).toBe('completed');
          expect(res.body.generated_url).toBe(mockReport.generated_url);
          done();
        });
    });

    test('should return 404 when report not found', (done) => {
      db.query = jest.fn((query, values, callback) => {
        callback(null, []);
      });

      request(app)
        .get('/api/reports/d290f1ee-6c54-4b01-90e6-d701748f0851/status')
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toBe('Report not found');
          done();
        });
    });

    test('should return 400 with invalid UUID format', (done) => {
      request(app)
        .get('/api/reports/invalid-uuid/status')
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toContain('Invalid report_id format');
          done();
        });
    });

    test('should return 500 on database error', (done) => {
      db.query = jest.fn((query, values, callback) => {
        callback(new Error('Database query failed'), null);
      });

      request(app)
        .get('/api/reports/d290f1ee-6c54-4b01-90e6-d701748f0851/status')
        .expect(500)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.message).toBe('Database error');
          done();
        });
    });
  });
});
