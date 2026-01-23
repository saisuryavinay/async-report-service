/**
 * Unit tests for Worker service
 */
const reportService = require('../../src/worker/services/reportService');

describe('Worker Service Unit Tests', () => {
  describe('generateReport', () => {
    test('should generate report with valid parameters', async () => {
      // Mock Math.random to avoid failure simulation
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.5); // Above 0.2 threshold

      const reportId = 'test-report-123';
      const reportType = 'sales_summary';
      const parameters = { startDate: '2023-01-01', endDate: '2023-03-31' };

      const result = await reportService.generateReport(reportId, reportType, parameters);

      expect(result).toBe(`http://reports.example.com/${reportId}.pdf`);
      mockRandom.mockRestore();
    });

    test('should throw error when simulated failure occurs', async () => {
      // Mock Math.random to trigger failure
      const mockRandom = jest.spyOn(Math, 'random');
      mockRandom.mockReturnValue(0.1); // Below 0.2 threshold

      const reportId = 'test-report-456';
      const reportType = 'user_activity';
      const parameters = { userId: 'user123' };

      await expect(
        reportService.generateReport(reportId, reportType, parameters)
      ).rejects.toThrow('Simulated transient processing error');

      mockRandom.mockRestore();
    });
  });

  describe('validateReportParameters', () => {
    test('should validate sales_summary report with required dates', () => {
      const result = reportService.validateReportParameters('sales_summary', {
        startDate: '2023-01-01',
        endDate: '2023-03-31'
      });
      expect(result).toBe(true);
    });

    test('should invalidate sales_summary without required dates', () => {
      const result = reportService.validateReportParameters('sales_summary', {
        region: 'EMEA'
      });
      expect(result).toBe(false);
    });

    test('should validate user_activity with userId', () => {
      const result = reportService.validateReportParameters('user_activity', {
        userId: 'user123'
      });
      expect(result).toBe(true);
    });

    test('should validate user_activity with startDate', () => {
      const result = reportService.validateReportParameters('user_activity', {
        startDate: '2023-01-01'
      });
      expect(result).toBe(true);
    });

    test('should accept other report types with any parameters', () => {
      const result = reportService.validateReportParameters('custom_report', {
        customParam: 'value'
      });
      expect(result).toBe(true);
    });

    test('should reject invalid report_type', () => {
      const result = reportService.validateReportParameters(null, {});
      expect(result).toBe(false);
    });

    test('should reject non-string report_type', () => {
      const result = reportService.validateReportParameters(123, {});
      expect(result).toBe(false);
    });
  });
});
