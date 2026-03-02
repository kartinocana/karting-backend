require("dotenv").config();
const { Pool } = require("pg");

let pool;

if (process.env.DATABASE_URL) {
  console.log("🌍 DB: usando DATABASE_URL (cloud)");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  console.log("💻 DB: usando configuración local");

  if (!process.env.DB_NAME) {
    console.error("🔴 ERROR: DB_NAME no definido");
    process.exit(1);
  }
  if (!process.env.DB_PASSWORD) {
    console.error("🔴 ERROR: DB_PASSWORD no definido");
    process.exit(1);
  }

  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    password: String(process.env.DB_PASSWORD),
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 5432,
  });
}

pool.connect()
  .then(c => { console.log("🟢 DB CONECTADA"); c.release(); })
  .catch(err => { console.error("🔴 ERROR DB:", err); process.exit(1); });

module.exports = pool;