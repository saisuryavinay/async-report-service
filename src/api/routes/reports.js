const express = require('express');
const router = express.Router();

const reportsController = require('../controllers/reportsController');

// POST generate report
router.post('/generate', reportsController.generateReport);

// GET report status
router.get('/:id/status', reportsController.getReportStatus);

module.exports = router;
