const amqp = require("amqplib");

const RABBITMQ_URL = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`;

let channel;

async function connectRabbitMQ() {
  const connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue("report_queue", {
    durable: true
  });

  console.log("✅ Connected to RabbitMQ");
}

function getChannel() {
  return channel;
}

module.exports = { connectRabbitMQ, getChannel };
