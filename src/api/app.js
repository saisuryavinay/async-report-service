require('dotenv').config();
require('../config/db');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const reportsRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: "API is healthy" });
});

// Routes
app.use('/api/reports', reportsRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: "Internal Server Error"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API Service running on port ${PORT}`);
});
