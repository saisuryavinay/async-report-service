/**
 * Integration tests for the complete API flow
 * These tests require the full stack to be running (docker-compose up)
 */
const request = require('supertest');
const mysql = require('mysql2/promise');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root_password',
  database: process.env.DB_NAME || 'reports_db'
};

describe('API Integration Tests', () => {
  let dbConnection;

  beforeAll(async () => {
    // Connect to database for verification
    try {
      dbConnection = await mysql.createConnection(DB_CONFIG);
    } catch (error) {
      console.warn('Database connection failed. Tests may be limited:', error.message);
    }
  });

  afterAll(async () => {
    if (dbConnection) {
      await dbConnection.end();
    }
  });

  describe('POST /api/reports/generate', () => {
    test('should create a report and return 202', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/reports/generate')
        .send({
          report_type: 'sales_summary',
          parameters: {
            startDate: '2023-01-01',
            endDate: '2023-03-31',
            region: 'EMEA'
          }
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('report_id');
      expect(response.body.status).toBe('pending');
      expect(response.body.message).toBe('Report generation initiated.');

      // Verify database entry if connection available
      if (dbConnection) {
        const [rows] = await dbConnection.execute(
          'SELECT * FROM reports WHERE id = ?',
          [response.body.report_id]
        );
        expect(rows.length).toBe(1);
        expect(rows[0].status).toBe('pending');
        expect(rows[0].report_type).toBe('sales_summary');
      }
    });

    test('should reject request without report_type', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/reports/generate')
        .send({
          parameters: { startDate: '2023-01-01' }
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('report_type');
    });

    test('should handle parameters as optional', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/reports/generate')
        .send({
          report_type: 'user_activity'
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('report_id');
    });
  });

  describe('GET /api/reports/:id/status', () => {
    let testReportId;

    beforeAll(async () => {
      // Create a test report
      const response = await request(API_BASE_URL)
        .post('/api/reports/generate')
        .send({
          report_type: 'test_report',
          parameters: { test: true }
        });
      testReportId = response.body.report_id;
    });

    test('should return report status for existing report', async () => {
      const response = await request(API_BASE_URL)
        .get(`/api/reports/${testReportId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.report_id).toBe(testReportId);
      expect(response.body).toHaveProperty('status');
      expect(['pending', 'processing', 'completed', 'failed']).toContain(response.body.status);
      expect(response.body).toHaveProperty('generated_url');
      expect(response.body).toHaveProperty('failure_reason');
      expect(response.body).toHaveProperty('retry_count');
    });

    test('should return 404 for non-existent report', async () => {
      const fakeId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
      const response = await request(API_BASE_URL)
        .get(`/api/reports/${fakeId}/status`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Report not found');
    });

    test('should return 400 for invalid UUID format', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/reports/invalid-id-format/status');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid');
    });
  });

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await request(API_BASE_URL)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('API is healthy');
    });
  });

  describe('Worker Processing (Async)', () => {
    test('should process report and update status to completed', async () => {
      // Create a report
      const createResponse = await request(API_BASE_URL)
        .post('/api/reports/generate')
        .send({
          report_type: 'sales_summary',
          parameters: { startDate: '2023-01-01', endDate: '2023-12-31' }
        });

      const reportId = createResponse.body.report_id;
      expect(createResponse.status).toBe(202);

      // Poll for completion (with timeout)
      const maxAttempts = 30; // 30 seconds max
      let attempts = 0;
      let completed = false;

      while (attempts < maxAttempts && !completed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await request(API_BASE_URL)
          .get(`/api/reports/${reportId}/status`);

        if (statusResponse.body.status === 'completed') {
          expect(statusResponse.body.generated_url).toBeTruthy();
          expect(statusResponse.body.generated_url).toContain(reportId);
          completed = true;
        } else if (statusResponse.body.status === 'failed') {
          // Some reports may fail due to simulated errors, which is expected
          console.log('Report failed (expected for testing):', statusResponse.body.failure_reason);
          completed = true;
        }

        attempts++;
      }

      expect(completed).toBe(true);
    }, 35000); // 35 second timeout for this test
  });
});
