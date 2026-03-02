// =====================================================
// DRIVERS ROUTES (POSTGRESQL - VERSION FINAL ESTABLE)
// =====================================================
const express = require("express");
const router = express.Router();
const pool = require("../../db");


// -----------------------------------------------------
// GET /api/drivers  → LISTAR TODOS
// -----------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        name,
        lastname,
        nickname,
        dni,
        email,
        skill,
        weight_kg AS weight,
        transponder
      FROM drivers
      ORDER BY id;
    `);

    res.json(rows);
  } catch (err) {
    console.error("❌ GET /api/drivers error:", err);
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------
// GET /api/drivers/:id/history
// HISTORIAL LIMPIO (SIN VUELTAS 0)
// -----------------------------------------------------
router.get("/:id/history", async (req, res) => {
  try {
    const driverId = Number(req.params.id);

    const { rows } = await pool.query(`
      SELECT 
        s.id AS session_id,
        s.name AS session_name,
        s.type AS session_type,
        l.lap_number AS lap,
        l.lap_time_ms AS time_ms
      FROM laps l
      JOIN sessions s 
        ON s.id = l.session_id
      WHERE l.driver_id = $1
        AND l.lap_time_ms > 0
      ORDER BY s.id DESC, l.lap_number ASC
    `, [driverId]);

    if (!rows.length) return res.json([]);

    const sessionsMap = new Map();

    for (const r of rows) {
      if (!sessionsMap.has(r.session_id)) {
        sessionsMap.set(r.session_id, {
          session: {
            id: r.session_id,
            name: r.session_name,
            type: r.session_type
          },
          laps: []
        });
      }

      sessionsMap.get(r.session_id).laps.push({
        lap: r.lap,
        time_ms: r.time_ms
      });
    }

    const history = [];

    for (const s of sessionsMap.values()) {
      const times = s.laps.map(l => l.time_ms);

      const totalMs = times.reduce((a,b)=>a+b,0);
      const avgMs = totalMs / times.length;
      const bestMs = Math.min(...times);

      const deviation =
        times.reduce((sum,t)=>sum + Math.abs(t - avgMs),0) /
        times.length;

      const consistencyPercent =
        avgMs > 0
          ? Math.max(0, (1 - deviation / avgMs) * 100)
          : 0;

      s.summary = {
        total_laps: times.length,
        best_lap: bestMs,
        avg_lap: avgMs,
        consistency: consistencyPercent,
        total_time: totalMs
      };

      history.push(s);
    }

    res.json(history);

  } catch (err) {
    console.error("❌ GET /api/drivers/:id/history error:", err);
    res.status(500).json({ error: "driver history error" });
  }
});


// -----------------------------------------------------
// GET /api/drivers/:id
// -----------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const driverId = Number(req.params.id);

    const { rows } = await pool.query(
      `SELECT
        id,
        name,
        lastname,
        nickname,
        dni,
        email,
        skill,
        weight_kg AS weight,
        transponder
       FROM drivers
       WHERE id = $1`,
      [driverId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Driver no encontrado" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("❌ GET /api/drivers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------
// POST /api/drivers
// -----------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const {
      name,
      lastname,
      nickname,
      dni,
      email,
      skill,
      weight,
      transponder
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO drivers
       (name, lastname, nickname, dni, email, skill, weight_kg, transponder)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING
         id,
         name,
         lastname,
         nickname,
         dni,
         email,
         skill,
         weight_kg AS weight,
         transponder`,
      [
        name,
        lastname || null,
        nickname || null,
        dni || null,
        email || null,
        skill || null,
        weight || null,
        transponder || null
      ]
    );

    res.json(rows[0]);

  } catch (err) {
    console.error("❌ POST /api/drivers error:", err);
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------
// PUT /api/drivers/:id
// -----------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const driverId = Number(req.params.id);

    const {
      name,
      lastname,
      nickname,
      dni,
      email,
      skill,
      weight,
      transponder
    } = req.body;

    const { rowCount, rows } = await pool.query(
      `UPDATE drivers SET
         name = COALESCE($1, name),
         lastname = COALESCE($2, lastname),
         nickname = COALESCE($3, nickname),
         dni = COALESCE($4, dni),
         email = COALESCE($5, email),
         skill = COALESCE($6, skill),
         weight_kg = COALESCE($7, weight_kg),
         transponder = COALESCE($8, transponder)
       WHERE id = $9
       RETURNING
         id,
         name,
         lastname,
         nickname,
         dni,
         email,
         skill,
         weight_kg AS weight,
         transponder`,
      [
        name,
        lastname,
        nickname,
        dni,
        email,
        skill,
        weight,
        transponder,
        driverId
      ]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Driver no encontrado" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("❌ PUT /api/drivers error:", err);
    res.status(500).json({ error: err.message });
  }
});


// -----------------------------------------------------
// DELETE /api/drivers/:id
// -----------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const driverId = Number(req.params.id);

    const { rowCount } = await pool.query(
      "DELETE FROM drivers WHERE id = $1",
      [driverId]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Driver no encontrado" });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ DELETE /api/drivers error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
