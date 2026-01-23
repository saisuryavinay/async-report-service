const db = require('../../config/db');
const { v4: uuidv4 } = require('uuid');
const { getChannel } = require("../../config/rabbitmq");

/**
 * POST /api/reports/generate
 * Accepts report generation requests and publishes to RabbitMQ
 * Returns 202 Accepted with report_id immediately
 */
exports.generateReport = async (req, res) => {
  try {
    const { report_type, parameters } = req.body;

    // Input validation
    if (!report_type || typeof report_type !== 'string') {
      return res.status(400).json({
        message: "report_type is required and must be a string"
      });
    }

    if (parameters && typeof parameters !== 'object') {
      return res.status(400).json({
        message: "parameters must be an object"
      });
    }

    const report_id = uuidv4();
    const request_payload = { report_type, parameters: parameters || {} };

    const query = `
      INSERT INTO reports 
      (id, report_type, request_payload, status, retry_count)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
      query,
      [
        report_id,
        report_type,
        JSON.stringify(request_payload),
        "pending",
        0
      ],
      (err, result) => {
        if (err) {
          console.error('❌ Database error during report creation:', err);
          return res.status(500).json({
            message: "Database error"
          });
        }

        // Publish message to RabbitMQ
        try {
          const channel = getChannel();
          const exchange = process.env.RABBITMQ_EXCHANGE || 'report_exchange';
          const routingKey = process.env.RABBITMQ_ROUTING_KEY || 'report_key';

          const messagePayload = {
            report_id,
            report_type,
            parameters: parameters || {},
            timestamp: new Date().toISOString()
          };

          channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(messagePayload)),
            { persistent: true }
          );

          console.log(`✅ Report ${report_id} queued successfully`);

          return res.status(202).json({
            report_id,
            status: "pending",
            message: "Report generation initiated."
          });
        } catch (mqError) {
          console.error('❌ RabbitMQ error during message publishing:', mqError);
          
          // Rollback: delete the report from database if message publishing fails
          db.query('DELETE FROM reports WHERE id = ?', [report_id], (delErr) => {
            if (delErr) {
              console.error('❌ Failed to rollback report:', delErr);
            }
          });

          return res.status(500).json({
            message: "Failed to queue report generation"
          });
        }
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error in generateReport:', error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};

/**
 * GET /api/reports/:id/status
 * Returns current status and details of a report
 */
exports.getReportStatus = async (req, res) => {
  try {
    const report_id = req.params.id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(report_id)) {
      return res.status(400).json({
        message: "Invalid report_id format"
      });
    }

    const query = `SELECT * FROM reports WHERE id = ?`;

    db.query(query, [report_id], (err, results) => {
      if (err) {
        console.error('❌ Database error fetching report status:', err);
        return res.status(500).json({
          message: "Database error"
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: "Report not found"
        });
      }

      const report = results[0];

      return res.status(200).json({
        report_id: report.id,
        status: report.status,
        generated_url: report.generated_url,
        failure_reason: report.failure_reason,
        retry_count: report.retry_count
      });
    });
  } catch (error) {
    console.error('❌ Unexpected error in getReportStatus:', error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};
