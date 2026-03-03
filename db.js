require("dotenv").config();
const { Pool } = require("pg");

const isCloud = !!process.env.DATABASE_URL;

const pool = isCloud
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "postgres",
      password: String(process.env.DB_PASSWORD),
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT) || 5432,
    });

module.exports = pool;