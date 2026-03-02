const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ======================================================
// START / RESUME SESSION
// ======================================================
router.post("/session/:id/start", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

   await pool.query(`
  UPDATE sessions
  SET
    status = 'running',
    started_at = COALESCE(started_at, NOW()),
    paused_at = NULL,
    finished_at = NULL          -- 🔹 CLAVE
  WHERE id = $1
`, [sessionId]);


    res.json({ status: "running" });
  } catch (err) {
    console.error("❌ start session:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ======================================================
// PAUSE SESSION
// ======================================================
router.post("/session/:id/pause", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    await pool.query(`
      UPDATE sessions
      SET status = 'paused', paused_at = NOW()
      WHERE id = $1
    `, [sessionId]);

    res.json({ status: "paused" });
  } catch (err) {
    console.error("❌ pause session:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ======================================================
// STOP / FINISH SESSION
// ======================================================
router.post("/session/:id/stop", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    await pool.query(`
      UPDATE sessions
      SET status = 'finished', finished_at = NOW()
      WHERE id = $1
    `, [sessionId]);

    res.json({ status: "finished" });
  } catch (err) {
    console.error("❌ stop session:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ======================================================
// LIVE TIMING EXTENDED (✅ CORRECTO)
// ======================================================
router.get("/session/:id/live-extended", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const classification = await pool.query(`
      WITH lap_stats AS (
        SELECT
          l.race_entry_id,
          COUNT(*)           AS lapcount,
          MIN(l.lap_time_ms) AS best,
          SUM(l.lap_time_ms) AS total,
          AVG(l.lap_time_ms) AS mean
        FROM laps l
        WHERE l.session_id = $1
        GROUP BY l.race_entry_id
      ),
      last_lap AS (
        SELECT DISTINCT ON (l.race_entry_id)
          l.race_entry_id,
          l.lap_time_ms AS last_time
        FROM laps l
        WHERE l.session_id = $1
        ORDER BY l.race_entry_id, l.lap_number DESC
      )
      SELECT
        re.id,
        re.driver_id,
        re.kart_id,
        re.starting_position,

        d.name AS driver_name,
        d.nickname AS driver_nickname,
        d.skill AS driver_category,
        d.weight_kg AS driver_weight,
        d.transponder AS driver_transponder,

        k.number AS kart_number,
        k.transponder AS kart_transponder,

        re.transponder AS entry_transponder,

        COALESCE(
          re.transponder,
          k.transponder,
          d.transponder
        ) AS transponder
      FROM race_entries re
      LEFT JOIN drivers d ON d.id = re.driver_id
      LEFT JOIN karts k ON k.id = re.kart_id
      WHERE re.session_id = $1
      ORDER BY COALESCE(re.starting_position, re.id)
    `, [sessionId]);

    const bestLap = await pool.query(`
      SELECT MIN(lap_time_ms) AS best_lap
      FROM laps
      WHERE session_id = $1
    `, [sessionId]);

    const participants = await pool.query(`
      SELECT COUNT(*) FROM race_entries WHERE session_id = $1
    `, [sessionId]);

    res.json({
      classification: classification.rows,
      bestLapTime: bestLap.rows[0]?.best_lap || null,
      participants: Number(participants.rows[0].count)
    });

  } catch (err) {
    console.error("❌ live-extended:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ======================================================
// GET ENTRIES (PARRILLA)
// ======================================================
router.get("/session/:id/entries", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const result = await pool.query(
      `
      SELECT
        re.id,
        re.driver_id,
        re.kart_id,
        re.starting_position,

        d.name AS driver_name,
        d.skill AS driver_category,
        d.weight_kg AS driver_weight,
        d.transponder AS driver_transponder,

        k.number AS kart_number,
        k.transponder AS kart_transponder,

        re.transponder AS entry_transponder,

        COALESCE(
          re.transponder,
          k.transponder,
          d.transponder
        ) AS transponder
      FROM race_entries re
      LEFT JOIN drivers d ON d.id = re.driver_id
      LEFT JOIN karts k ON k.id = re.kart_id
      WHERE re.session_id = $1
      ORDER BY COALESCE(re.starting_position, re.id)
      `,
      [sessionId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ get entries:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// ======================================================
// CREATE ENTRY MANUAL (POST /entries)
// ======================================================
router.post("/session/:id/entries", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const { driver_id, kart_id, starting_position } = req.body;

    if (!driver_id && !kart_id) {
      return res.status(400).json({
        error: "driver_id o kart_id requerido"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO race_entries
        (session_id, driver_id, kart_id, starting_position)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        sessionId,
        driver_id || null,
        kart_id || null,
        starting_position || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("❌ post race entry:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// =====================================
// PUT editar entry (kart / grid)
// =====================================
router.put("/session/:sessionId/entries/:entryId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const entryId = Number(req.params.entryId);
    const { kart_id, starting_position, transponder } = req.body;

    if (!Number.isInteger(sessionId) || !Number.isInteger(entryId)) {
      return res.status(400).json({ error: "IDs inválidos" });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (kart_id !== undefined) {
      fields.push(`kart_id = $${idx++}`);
      values.push(kart_id);
    }

    if (starting_position !== undefined) {
      fields.push(`starting_position = $${idx++}`);
      values.push(starting_position);
    }

    if (transponder !== undefined) {
      fields.push(`transponder = $${idx++}`);
      values.push(transponder);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    values.push(entryId, sessionId);

    const result = await pool.query(
      `
      UPDATE race_entries
      SET ${fields.join(", ")}
      WHERE id = $${idx++} AND session_id = $${idx}
      RETURNING *
      `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Entry no encontrada" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ PUT race entry:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// =====================================
// DELETE eliminar entry de sesión
// =====================================
router.delete("/session/:sessionId/entries/:entryId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const entryId = Number(req.params.entryId);

    if (!Number.isInteger(sessionId) || !Number.isInteger(entryId)) {
      return res.status(400).json({ error: "IDs inválidos" });
    }

    const result = await pool.query(
      `
      DELETE FROM race_entries
      WHERE id = $1 AND session_id = $2
      RETURNING id
      `,
      [entryId, sessionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Entry no encontrada" });
    }

    res.sendStatus(204);

  } catch (err) {
    console.error("❌ DELETE race entry:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// =======================================
// EXPORT EXTRA: LIVE DATA PARA CAMPEONATOS
// =======================================
router.getSessionLiveData = function getSessionLiveData(sessionId) {
  if (!global.latestLiveData) return null;

  if (Number(global.latestLiveData.session_id) !== Number(sessionId)) {
    return null;
  }

  return global.latestLiveData;
};

// ======================================================
// IMPORTAR PARRILLA DESDE session_participants (CORRECTO)
// POST /api/race-control/session/:sessionId/import-from-session
// ======================================================
router.post(
  "/session/:sessionId/import-from-session",
  async (req, res) => {
    const sessionId = Number(req.params.sessionId);

    try {
      // 1) Leer parrilla ORIGINAL de la sesión
      const { rows } = await pool.query(`
        SELECT driver_id, kart_id, starting_position
        FROM session_participants
        WHERE session_id = $1
      `, [sessionId]);

      if (!rows.length) {
        return res.status(400).send(
          "No hay participantes en session_participants"
        );
      }

      let imported = 0;

      for (const r of rows) {
        // Insertar SOLO si aún no existe en race_entries
        const check = await pool.query(`
          SELECT 1
          FROM race_entries
          WHERE session_id = $1
            AND driver_id = $2
            AND kart_id = $3
        `, [sessionId, r.driver_id, r.kart_id]);

        if (check.rowCount === 0) {
          await pool.query(`
            INSERT INTO race_entries
              (session_id, driver_id, kart_id, starting_position)
            VALUES ($1, $2, $3, $4)
          `, [
            sessionId,
            r.driver_id,
            r.kart_id,
            r.starting_position
          ]);

          imported++;
        }
      }

      res.json({ ok: true, imported });

    } catch (e) {
      console.error("❌ import-from-session:", e);
      res.status(500).send("Error importando parrilla");
    }
  }
);

module.exports = router;
