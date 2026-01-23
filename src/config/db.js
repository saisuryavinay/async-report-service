const mysql = require('mysql2');
require('dotenv').config();

let db;

function createConnection() {
  db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  db.connect((err) => {
    if (err) {
      console.error("❌ MySQL connection failed:", err.message);
      console.log("⏳ Retrying in 5 seconds...");
      setTimeout(createConnection, 5000);
    } else {
      console.log("✅ Connected to MySQL Database");
    }
  });

  db.on('error', (err) => {
    console.error('❌ MySQL error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
      console.log('⏳ Reconnecting to MySQL...');
      createConnection();
    }
  });
}

createConnection();

module.exports = db;
