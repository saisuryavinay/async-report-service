require('dotenv').config();
const amqp = require("amqplib");
const db = require("../config/db");

// Configuration from environment variables
const RABBITMQ_URL = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`;
const REPORT_EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'report_exchange';
const REPORT_QUEUE = process.env.RABBITMQ_QUEUE || 'report_queue';
const DLQ_EXCHANGE = process.env.RABBITMQ_DLQ_EXCHANGE || 'dlq_exchange';
const DLQ_QUEUE = process.env.RABBITMQ_DLQ_QUEUE || 'report_dlq';
const DLQ_ROUTING_KEY = process.env.RABBITMQ_DLQ_ROUTING_KEY || 'report_dlq_key';
const REPORT_ROUTING_KEY = process.env.RABBITMQ_ROUTING_KEY || 'report_key';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');

let channel;

/**
 * Initialize RabbitMQ connection and declare all necessary exchanges and queues
 */
async function initializeRabbitMQ(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Set prefetch to 1 to process one message at a time
      await channel.prefetch(1);

      // Declare exchanges
      await channel.assertExchange(REPORT_EXCHANGE, 'direct', { durable: true });
      await channel.assertExchange(DLQ_EXCHANGE, 'direct', { durable: true });

      // Declare and bind DLQ
      await channel.assertQueue(DLQ_QUEUE, { durable: true });
      await channel.bindQueue(DLQ_QUEUE, DLQ_EXCHANGE, DLQ_ROUTING_KEY);

      // Declare main queue with DLX configuration
      await channel.assertQueue(REPORT_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DLQ_EXCHANGE,
          'x-dead-letter-routing-key': DLQ_ROUTING_KEY
        }
      });
      await channel.bindQueue(REPORT_QUEUE, REPORT_EXCHANGE, REPORT_ROUTING_KEY);

      console.log('✅ Worker connected to RabbitMQ');
      console.log(`   - Listening on queue: ${REPORT_QUEUE}`);
      console.log(`   - DLQ configured: ${DLQ_QUEUE}`);
      console.log(`   - Max retries: ${MAX_RETRIES}`);

      // Handle connection events
      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
        process.exit(1);
      });

      connection.on('close', () => {
        console.log('⚠️ RabbitMQ connection closed. Reconnecting...');
        setTimeout(() => initializeRabbitMQ(retries, delay), 5000);
      });

      return channel;
    } catch (error) {
      console.error(`❌ Failed to initialize RabbitMQ (attempt ${attempt}/${retries}):`, error.message);
      
      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Max retries reached. Worker shutting down.');
        throw error;
      }
    }
  }
}

/**
 * Update report status in database with promisified query
 */
function updateReportStatus(reportId, status, additionalFields = {}) {
  return new Promise((resolve, reject) => {
    const fields = { status, ...additionalFields };
    const setClause = Object.keys(fields).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(fields), reportId];
    
    const query = `UPDATE reports SET ${setClause} WHERE id = ?`;
    
    db.query(query, values, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Get current report data from database
 */
function getReport(reportId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM reports WHERE id = ?', [reportId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * Simulate report generation with random delay and potential failure
 */
async function generateReport(reportId, reportType, parameters) {
  // Simulate CPU-intensive task with 5-10 second delay
  const delay = Math.floor(Math.random() * 5000) + 5000;
  console.log(`⏳ Processing report ${reportId} (estimated ${delay}ms)...`);
  
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate random failures (20% chance) for testing retry/DLQ
  if (Math.random() < 0.2) {
    throw new Error('Simulated transient processing error');
  }

  // Generate dummy report URL
  const generatedUrl = `http://reports.example.com/${reportId}.pdf`;
  
  return generatedUrl;
}

/**
 * Process a single message from the queue
 */
async function processMessage(msg) {
  if (!msg) return;

  const messageContent = msg.content.toString();
  let messageData;

  try {
    messageData = JSON.parse(messageContent);
  } catch (error) {
    console.error('❌ Invalid message format:', messageContent);
    channel.ack(msg); // Acknowledge and discard malformed messages
    return;
  }

  const { report_id, report_type, parameters } = messageData;

  if (!report_id) {
    console.error('❌ Message missing report_id:', messageData);
    channel.ack(msg); // Acknowledge and discard invalid messages
    return;
  }

  console.log(`📥 Received message for report: ${report_id}`);

  try {
    // Get current report state
    const report = await getReport(report_id);
    
    if (!report) {
      console.error(`❌ Report ${report_id} not found in database`);
      channel.ack(msg);
      return;
    }

    const currentRetryCount = report.retry_count || 0;

    // Update status to 'processing'
    await updateReportStatus(report_id, 'processing');
    console.log(`🔄 Processing report ${report_id} (attempt ${currentRetryCount + 1}/${MAX_RETRIES + 1})`);

    // Generate the report
    const generatedUrl = await generateReport(report_id, report_type, parameters);

    // Success: Update to completed
    await updateReportStatus(report_id, 'completed', {
      generated_url: generatedUrl
    });

    console.log(`✅ Report ${report_id} completed successfully`);
    console.log(`   Generated URL: ${generatedUrl}`);

    // Acknowledge message
    channel.ack(msg);

  } catch (error) {
    console.error(`❌ Error processing report ${report_id}:`, error.message);

    try {
      const report = await getReport(report_id);
      const currentRetryCount = report.retry_count || 0;

      if (currentRetryCount < MAX_RETRIES) {
        // Retry: increment retry count and requeue
        const newRetryCount = currentRetryCount + 1;
        await updateReportStatus(report_id, 'pending', {
          retry_count: newRetryCount,
          failure_reason: error.message
        });

        console.log(`🔄 Retrying report ${report_id} (${newRetryCount}/${MAX_RETRIES})`);
        
        // NACK with requeue to retry
        channel.nack(msg, false, true);

      } else {
        // Max retries exceeded: move to DLQ
        await updateReportStatus(report_id, 'failed', {
          failure_reason: `Failed after ${MAX_RETRIES} retries: ${error.message}`
        });

        console.log(`💀 Report ${report_id} moved to DLQ after ${MAX_RETRIES} retries`);
        
        // NACK without requeue to send to DLQ
        channel.nack(msg, false, false);
      }
    } catch (dbError) {
      console.error(`❌ Database error during retry handling for ${report_id}:`, dbError);
      // Requeue the message to try again later
      channel.nack(msg, false, true);
    }
  }
}

/**
 * Start consuming messages from the queue
 */
async function startWorker() {
  try {
    await initializeRabbitMQ();

    console.log('🟢 Worker is waiting for messages...');

    // Consume messages from the queue
    channel.consume(REPORT_QUEUE, processMessage, {
      noAck: false // Manual acknowledgment
    });

  } catch (error) {
    console.error('❌ Worker startup error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️ Shutting down worker gracefully...');
  if (channel) {
    await channel.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ Shutting down worker gracefully...');
  if (channel) {
    await channel.close();
  }
  process.exit(0);
});

// Start the worker
startWorker();
