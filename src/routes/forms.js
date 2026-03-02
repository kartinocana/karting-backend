// backend/src/routes/history.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ===============================
// HISTORIAL POR PILOTO
// ===============================
router.get("/driver/:driverId", async (req, res) => {
  const driverId = Number(req.params.driverId);

  try {
    const q = await pool.query(
      `
      SELECT 
        l.session_id,
        s.name AS session_name,
        s.type AS session_type,
        l.kart_id,
        k.number AS kart_number,
        COUNT(l.id)               AS laps,
        MIN(l.lap_time_ms)        AS best_lap,
        MAX(l.lap_number)         AS last_lap
      FROM laps l
      LEFT JOIN sessions s ON s.id = l.session_id
      LEFT JOIN karts k    ON k.id = l.kart_id
      WHERE l.driver_id = $1
      GROUP BY l.session_id, s.name, s.type, l.kart_id, k.number
      ORDER BY l.session_id DESC
      `,
      [driverId]
    );

    res.json({ driverId, history: q.rows });
  } catch (err) {
    console.error("❌ /history/driver:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ===============================
// HISTORIAL POR KART
// ===============================
router.get("/kart/:kartId", async (req, res) => {
  const kartId = Number(req.params.kartId);

  try {
    const q = await pool.query(
      `
      SELECT 
        l.session_id,
        s.name AS session_name,
        s.type AS session_type,
        l.driver_id,
        d.name AS driver_name,
        COUNT(l.id)               AS laps,
        MIN(l.lap_time_ms)        AS best_lap,
        MAX(l.lap_number)         AS last_lap
      FROM laps l
      LEFT JOIN sessions s ON s.id = l.session_id
      LEFT JOIN drivers d  ON d.id = l.driver_id
      WHERE l.kart_id = $1
      GROUP BY l.session_id, s.name, s.type, l.driver_id, d.name
      ORDER BY l.session_id DESC
      `,
      [kartId]
    );

    res.json({ kartId, history: q.rows });
  } catch (err) {
    console.error("❌ /history/kart:", err);
    res.status(500).json({ error: "DB error" });
  }
});

module.exports = router;
