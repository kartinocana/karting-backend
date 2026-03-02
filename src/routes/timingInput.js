const express = require("express");
const router = express.Router();
const pool = require("../../db");

/*
 ESTRUCTURA REAL DE TU TABLA "laps"
 ------------------------------------------------
 id               SERIAL PK
 session_id       int
 driver_id        int
 kart_id          int
 lap_number       int
 lap_time_ms      int
 sector1_ms       int
 sector2_ms       int
 sector3_ms       int
 timing_point_id  int
 created_at       timestamp
*/

// 1) Crear tabla timing_log_raw si no existe
async function ensureRawTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timing_log_raw (
      id SERIAL PRIMARY KEY,
      transponder VARCHAR(50),
      decoder VARCHAR(50),
      ts TIMESTAMP,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureRawTable();

// -----------------------------------------------------------
// ENDPOINT PRINCIPAL: CRONONET ENVÍA TIEMPOS AQUÍ
// -----------------------------------------------------------
router.post("/crononet", async (req, res) => {
  try {
    const { transponder, timestamp } = req.body;

    console.log("📡 CronoNet recibido:", req.body);

    // 1) Buscar kart por transponder (si no existe, lo creamos virtualmente)
    let kartQ = await pool.query(
      "SELECT id FROM karts WHERE transponder = $1",
      [transponder]
    );

    if (kartQ.rows.length === 0) {
      console.error("⚠️ Kart no encontrado para transponder:", transponder);
      return res.status(400).json({ error: "kart_not_found" });
    }

    const kart_id = kartQ.rows[0].id;

    // 2) Buscar último piloto asignado a ese kart (SIN mirar estado)
    const spQ = await pool.query(
      `SELECT session_id, driver_id
       FROM session_participants
       WHERE kart_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [kart_id]
    );

    if (spQ.rows.length === 0) {
      console.error("⚠️ No hay piloto asignado al kart", kart_id);
      return res.status(400).json({ error: "no_driver_for_kart" });
    }

    const { session_id, driver_id } = spQ.rows[0];

    // 3) Calcular siguiente vuelta
    const lastLapQ = await pool.query(
      `SELECT COALESCE(MAX(lap_number), 0) AS maxlap
       FROM laps
       WHERE session_id = $1 AND kart_id = $2`,
      [session_id, kart_id]
    );

    const nextLap = lastLapQ.rows[0].maxlap + 1;

    // 4) INSERT SIEMPRE (SIN timing_point_id fijo)
 await pool.query(
  `INSERT INTO laps
   (session_id, driver_id, kart_id, lap_number, lap_time_ms,
    sector1_ms, sector2_ms, sector3_ms, timing_point_id, created_at)
   VALUES ($1,$2,$3,$4,$5,0,0,0,NULL,$6)`,
  [
    session_id,
    driver_id,
    kart_id,
    nextLap,
    Number(req.body.lap_time_ms),   // ✅ TIEMPO REAL
    new Date(timestamp)
  ]
);


    console.log("🏁 Vuelta guardada:", {
      session_id, driver_id, kart_id, lap: nextLap
    });

    res.json({ ok: true, lap: nextLap });

  } catch (err) {
    console.error("🔥 ERROR EN CRONONET:", err);
    res.status(500).json({ error: "CronoNet processing error" });
  }
});


module.exports = router;
