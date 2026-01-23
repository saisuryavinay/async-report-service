const amqp = require("amqplib");

const RABBITMQ_URL = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`;

let channel;
let connection;

/**
 * Initialize RabbitMQ connection and set up exchanges, queues, and bindings
 * This includes the main report queue and dead-letter queue configuration
 */
async function connectRabbitMQ(retries = 5, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Declare exchanges
      const REPORT_EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'report_exchange';
      const DLQ_EXCHANGE = process.env.RABBITMQ_DLQ_EXCHANGE || 'dlq_exchange';

      await channel.assertExchange(REPORT_EXCHANGE, 'direct', { durable: true });
      await channel.assertExchange(DLQ_EXCHANGE, 'direct', { durable: true });

      // Declare dead-letter queue first
      const DLQ_QUEUE = process.env.RABBITMQ_DLQ_QUEUE || 'report_dlq';
      await channel.assertQueue(DLQ_QUEUE, { durable: true });
      
      // Bind DLQ to its exchange
      const DLQ_ROUTING_KEY = process.env.RABBITMQ_DLQ_ROUTING_KEY || 'report_dlq_key';
      await channel.bindQueue(DLQ_QUEUE, DLQ_EXCHANGE, DLQ_ROUTING_KEY);

      // Declare main report queue with DLX configuration
      const REPORT_QUEUE = process.env.RABBITMQ_QUEUE || 'report_queue';
      await channel.assertQueue(REPORT_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DLQ_EXCHANGE,
          'x-dead-letter-routing-key': DLQ_ROUTING_KEY
        }
      });

      // Bind main queue to report exchange
      const REPORT_ROUTING_KEY = process.env.RABBITMQ_ROUTING_KEY || 'report_key';
      await channel.bindQueue(REPORT_QUEUE, REPORT_EXCHANGE, REPORT_ROUTING_KEY);

      console.log("✅ Connected to RabbitMQ");
      console.log(`   - Exchange: ${REPORT_EXCHANGE}`);
      console.log(`   - Queue: ${REPORT_QUEUE}`);
      console.log(`   - DLQ Exchange: ${DLQ_EXCHANGE}`);
      console.log(`   - DLQ Queue: ${DLQ_QUEUE}`);

      // Handle connection events
      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      connection.on('close', () => {
        console.log('⚠️ RabbitMQ connection closed');
      });

      return; // Success, exit the function

    } catch (error) {
      console.error(`❌ Failed to connect to RabbitMQ (attempt ${attempt}/${retries}):`, error.message);
      
      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Max retries reached. Could not connect to RabbitMQ');
        throw error;
      }
    }
  }
}

/**
 * Get the RabbitMQ channel instance
 */
function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ first.');
  }
  return channel;
}

/**
 * Close RabbitMQ connection gracefully
 */
async function closeRabbitMQ() {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    console.log('✅ RabbitMQ connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing RabbitMQ connection:', error);
  }
}

module.exports = { connectRabbitMQ, getChannel, closeRabbitMQ };
