require('dotenv').config();
const db = require('../config/db');
const { connectRabbitMQ } = require("../config/rabbitmq");
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

// Wait for database connection before starting
async function startServer() {
  try {
    // Wait for services to be ready
    console.log('⏳ Waiting for services to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Connect to RabbitMQ with retry
    await connectRabbitMQ();
    
    // Additional wait for database
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    app.listen(PORT, () => {
      console.log(`✅ API Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    setTimeout(startServer, 5000); // Retry
  }
}

startServer();
