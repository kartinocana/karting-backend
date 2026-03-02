const express = require("express");
const router = express.Router();
const pool = require("../../db");

const participantsRouter = require("./participants");
router.use("/:id/participants", participantsRouter);

// ========= UTILIDADES =========
function formatGap(ms) {
  if (ms == null) return "-";
  let s = (ms / 1000).toFixed(3);
  if (!s.startsWith("+") && !s.startsWith("-")) s = "+" + s;
  return s;
}

function formatDiff(ms) {
  if (ms == null) return "-";
  let s = (ms / 1000).toFixed(3);
  if (!s.startsWith("+") && !s.startsWith("-")) s = "+" + s;
  return s;
}

function getKartStatus(hours) {
  if (hours >= 30) return "out";
  if (hours >= 20) return "service";
  return "ok";
}

// ========= LISTAR SESIONES =========
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT *
      FROM sessions
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /sessions:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ========= OBTENER SESIÓN =========
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { rows } = await pool.query(
      "SELECT * FROM sessions WHERE id = $1",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET /sessions/:id:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ========= CREAR SESIÓN =========
router.post("/", async (req, res) => {
  try {
    const { name, type, lap_limit, time_limit_seconds, max_drivers } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO sessions
        (name, type, status, lap_limit, time_limit_seconds, max_drivers, min_lap_ms)
      VALUES ($1, $2, 'pending', $3, $4, $5, 0)
      RETURNING *
      `,
      [name, type, lap_limit || null, time_limit_seconds || null, max_drivers || null]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ POST /sessions:", err);
    res.status(500).json({ error: "Insert error" });
  }
});

// ========= START =========
router.post("/:id/start", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.query(
      `
      UPDATE sessions
      SET status='running',
          started_at=NOW(),
          paused_at=NULL,
          finished_at=NULL,
          elapsed_seconds=0,
          remaining_time_sec=time_limit_seconds
      WHERE id=$1
      `,
      [id]
    );

    res.json({ status: "started" });
  } catch (err) {
    console.error("❌ START error:", err);
    res.status(500).json({ error: "Start session error" });
  }
});

// ========= PAUSE =========
router.post("/:id/pause", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { rows } = await pool.query(
      "SELECT started_at, elapsed_seconds FROM sessions WHERE id=$1",
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: "Session not found" });

    let elapsed = rows[0].elapsed_seconds || 0;

    if (rows[0].started_at) {
      elapsed += Math.floor((Date.now() - new Date(rows[0].started_at)) / 1000);
    }

    await pool.query(
      `
      UPDATE sessions
      SET status='paused',
          paused_at=NOW(),
          started_at=NULL,
          elapsed_seconds=$1
      WHERE id=$2
      `,
      [elapsed, id]
    );

    res.json({ status: "paused", elapsed_seconds: elapsed });
  } catch (err) {
    console.error("❌ PAUSE error:", err);
    res.status(500).json({ error: "Pause session error" });
  }
});

// ========= FLAG =========
router.post("/:id/flag", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { flag } = req.body;

    await pool.query(
      "UPDATE sessions SET current_flag=$1 WHERE id=$2",
      [flag, id]
    );

    res.json({ status: "flag updated" });
  } catch (err) {
    console.error("❌ FLAG error:", err);
    res.status(500).json({ error: "Flag update error" });
  }
});

// ========= LIVE EXTENDED (RACECONTROL) =========
router.get("/:id/live-extended", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const participants = await pool.query(
      `
      SELECT 
        sp.id AS participant_id,
        d.name AS driver_name,
        k.number AS kart_number,
        sp.weight,
        sp.category
      FROM session_participants sp
      LEFT JOIN drivers d ON d.id = sp.driver_id
      LEFT JOIN karts k ON k.id = sp.kart_id
      WHERE sp.session_id = $1
      `,
      [sessionId]
    );

    const laps = await pool.query(
      `
      SELECT participant_id, lap_number, lap_time_ms
      FROM laps
      WHERE session_id = $1
      ORDER BY participant_id, lap_number
      `,
      [sessionId]
    );

    const map = {};

    for (const p of participants.rows) {
      map[p.participant_id] = {
        participant_id: p.participant_id,
        racerName: p.driver_name || "-",
        racerNumber: p.kart_number || "-",
        lapcount: 0,
        lastTime: null,
        best: null,
        time: 0
      };
    }

    for (const lap of laps.rows) {
      const r = map[lap.participant_id];
      if (!r) continue;

      r.lapcount = lap.lap_number;
      r.lastTime = lap.lap_time_ms;
      r.time += lap.lap_time_ms;

      if (r.best == null || lap.lap_time_ms < r.best) {
        r.best = lap.lap_time_ms;
      }
    }

    let classification = Object.values(map).sort((a, b) => {
      if (b.lapcount !== a.lapcount) return b.lapcount - a.lapcount;
      return a.time - b.time;
    });

    const leader = classification[0];

    classification = classification.map((r, i) => ({
      ...r,
      pos: i + 1,
      gap: leader ? formatGap(r.time - leader.time) : "-"
    }));

    res.json({ classification });
  } catch (err) {
    console.error("❌ LIVE EXTENDED error:", err);
    res.status(500).json({ error: "Live error" });
  }
});

// ========= FINALIZAR SESIÓN =========
router.post("/:id/finish", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const { rows } = await pool.query(
      `
      UPDATE sessions
      SET status='finished', finished_at=NOW()
      WHERE id=$1
      RETURNING started_at
      `,
      [sessionId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Session not found" });
    }

    const start = new Date(rows[0].started_at);
    const hours = Math.max(1, Math.ceil((Date.now() - start) / 3600000));

    const { rows: karts } = await pool.query(
      `
      SELECT DISTINCT kart_id
      FROM session_participants
      WHERE session_id = $1
      `,
      [sessionId]
    );

  for (const k of karts) {
  // si por algún motivo no hay kart_id, se omite
  if (!k.kart_id) {
    console.warn("⚠️ FINISH: kart_id nulo, se omite");
    continue;
  }

  // sumar horas de uso
  await pool.query(
    "UPDATE karts SET hours_used = COALESCE(hours_used, 0) + $2 WHERE id=$1",
    [k.kart_id, hours]
  );

  // volver a leer el kart
  const { rows: kartRows } = await pool.query(
    "SELECT hours_used FROM karts WHERE id=$1",
    [k.kart_id]
  );

  // si no existe el kart, no seguimos con este
  if (!kartRows.length) {
    console.warn("⚠️ FINISH: kart no encontrado", k.kart_id);
    continue;
  }

  const hoursUsed = kartRows[0].hours_used || 0;
  const status = getKartStatus(hoursUsed);

  await pool.query(
    "UPDATE karts SET status=$2 WHERE id=$1",
    [k.kart_id, status]
  );

  await pool.query(
    `
    INSERT INTO kart_history
      (kart_id, event_type, description, hours, session_id)
    VALUES ($1, 'session', 'Uso en sesión', $2, $3)
    `,
    [k.kart_id, hours, sessionId]
  );
}


    res.json({ ok: true });
  } catch (err) {
    console.error("❌ FINISH error:", err);
    res.status(500).json({ error: "Finish error" });
  }
});

// ========= DELETE SESIÓN =========
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.query("DELETE FROM laps WHERE session_id=$1", [id]);
    await pool.query("DELETE FROM session_participants WHERE session_id=$1", [id]);
    await pool.query("DELETE FROM sessions WHERE id=$1", [id]);

    res.json({ status: "deleted" });
  } catch (err) {
    console.error("❌ DELETE error:", err);
    res.status(500).json({ error: "Delete error" });
  }
});
// =====================================================
// PUT SESSION (EDITAR SESIÓN)
// PUT /api/sessions/:id
// =====================================================
router.put("/:id", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: "session id inválido" });
    }

    const {
      name,
      type,
      lap_limit,
      time_limit_seconds
    } = req.body;

    const { rowCount, rows } = await pool.query(
      `
      UPDATE sessions
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        lap_limit = $3,
        time_limit_seconds = $4
      WHERE id = $5
      RETURNING *
      `,
      [
        name ?? null,
        type ?? null,
        lap_limit ?? null,
        time_limit_seconds ?? null,
        sessionId
      ]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Sesión no encontrada" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ PUT session error:", err);
    res.status(500).json({ error: "Error actualizando sesión" });
  }
});


module.exports = router;

