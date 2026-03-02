const express = require("express");
const router = express.Router();
const pool = require("../../db");



// POST /api/laps  → guardar una vuelta (CORREGIDO)
router.post("/", async (req, res) => {
  const {
    session_id,
    driver_id,
    kart_id,
    lap_number,
    lap_time_ms,
    sector1_ms,
    sector2_ms,
    sector3_ms
  } = req.body;

  if (!session_id || !driver_id || !lap_number || !lap_time_ms) {
    return res.status(400).json({ error: "Datos de vuelta incompletos" });
  }

  try {
    await pool.query(
      `
      INSERT INTO laps (
        session_id,
        driver_id,
        kart_id,
        lap_number,
        lap_time_ms,
        sector1_ms,
        sector2_ms,
        sector3_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        session_id,
        driver_id,
        kart_id ?? null,
        lap_number,
        lap_time_ms,
        sector1_ms ?? null,
        sector2_ms ?? null,
        sector3_ms ?? null
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ INSERT LAP ERROR:", err);
    res.status(500).json({ error: "Error guardando vuelta" });
  }
});


module.exports = router;
