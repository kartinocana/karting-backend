const express = require("express");
const router = express.Router();
const pool = require("../../db");

// GET /api/rankings/best-laps
router.get("/best-laps", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.name AS driver_name,
        s.name AS session_name,
        sh.best_lap AS best_lap
      FROM session_history sh
      LEFT JOIN drivers d ON d.id = sh.driver_id
      LEFT JOIN sessions s ON s.id = sh.session_id
      WHERE sh.best_lap IS NOT NULL
      ORDER BY sh.best_lap ASC
      LIMIT 50;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /best-laps:", err);
    res.status(500).json({ error: "Error cargando ranking" });
  }
});

module.exports = router;
