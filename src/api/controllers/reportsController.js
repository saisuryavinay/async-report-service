const db = require('../../config/db');
const { v4: uuidv4 } = require('uuid');
const { getChannel } = require("../../config/rabbitmq");

// POST /api/reports/generate
exports.generateReport = async (req, res) => {
  try {
    const { report_type, parameters } = req.body;

    // Validation
    if (!report_type) {
      return res.status(400).json({
        message: "report_type is required"
      });
    }

    const report_id = uuidv4();

    const query = `
      INSERT INTO reports 
      (id, report_type, request_payload, status)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      query,
      [
        report_id,
        report_type,
        JSON.stringify(parameters || {}),
        "pending"
      ],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({
            message: "Database error"
          });
        }

        // 🔥 PUBLISH MESSAGE TO RABBITMQ
        const channel = getChannel();

        channel.sendToQueue(
          "report_queue",
          Buffer.from(JSON.stringify({
            report_id,
            report_type,
            parameters
          })),
          { persistent: true }
        );

        return res.status(202).json({
          report_id,
          status: "pending",
          message: "Report generation initiated"
        });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};

// GET /api/reports/:id/status
exports.getReportStatus = async (req, res) => {
  try {
    const report_id = req.params.id;

    const query = `SELECT * FROM reports WHERE id = ?`;

    db.query(query, [report_id], (err, results) => {
      if (err) {
        console.error(err);
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
    console.error(error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};
