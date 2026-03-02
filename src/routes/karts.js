const express = require("express");
const router = express.Router();
const pool = require("../../db");
const PDFDocument = require("pdfkit");

// =======================
// ALERTAS DE MANTENIMIENTO
// GET /api/karts/alerts/maintenance
// =======================
router.get("/alerts/maintenance", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, number, hours_used, status
      FROM karts
      WHERE active = true
        AND status IN ('service', 'out')
      ORDER BY hours_used DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ kart alerts error", err);
    res.status(500).json({ error: "Error cargando alertas" });
  }
});

// =====================================================
// UTILIDAD INTERNA: convertir número visible → id real
// =====================================================
async function resolveKartIdByNumber(number) {
  const q = await pool.query(
    "SELECT id FROM karts WHERE number = $1",
    [Number(number)]
  );
  return q.rows.length ? q.rows[0].id : null;
}

// =====================================================
// HISTORIAL DE KART POR NÚMERO VISIBLE (RUTA PRINCIPAL)
// GET /api/karts/number/:number/history
// =====================================================
// GET /api/karts/number/:number/history
// =====================================================
// HISTORIAL DE KART POR NÚMERO VISIBLE (CORREGIDO)
// GET /api/karts/number/:number/history
// =====================================================
router.get("/number/:number/history", async (req, res) => {
  try {
    const kartNumber = Number(req.params.number);
    const kartId = await resolveKartIdByNumber(kartNumber);

    if (!kartId) {
      return res.json({
        summary: {
          total_laps: 0,
          best_lap_ms: null,
          avg_lap_ms: null,
          total_time_ms: 0,
          consistency_ms: null
        },
        sessions: [],
        laps: []
      });
    }

    // 1) Cargar TODAS las vueltas del kart con sesión y piloto
    const { rows } = await pool.query(`
      SELECT 
        s.id AS session_id,
        s.name AS session_name,
        s.type,
        l.lap_number,
        l.lap_time_ms,
        d.name AS driver_name
      FROM laps l
      JOIN sessions s ON s.id = l.session_id
      LEFT JOIN drivers d ON d.id = l.driver_id
      WHERE l.kart_id = $1
      ORDER BY s.started_at DESC, l.lap_number ASC;
    `, [kartId]);

    if (!rows.length) {
      return res.json({
        summary: {
          total_laps: 0,
          best_lap_ms: null,
          avg_lap_ms: null,
          total_time_ms: 0,
          consistency_ms: null
        },
        sessions: [],
        laps: []
      });
    }

    // 2) Agrupar por sesión
    const sessionsMap = new Map();
    const allTimes = [];

    for (const r of rows) {
      allTimes.push(r.lap_time_ms);

      if (!sessionsMap.has(r.session_id)) {
        sessionsMap.set(r.session_id, {
          session: {
            id: r.session_id,
            name: r.session_name,
            type: r.type
          },
          laps: [],
          summary: null
        });
      }

      sessionsMap.get(r.session_id).laps.push({
        lap: r.lap_number,
        time_ms: r.lap_time_ms,
        driver_name: r.driver_name
      });
    }

    // 3) Calcular resumen GLOBAL del kart
    const totalMs = allTimes.reduce((a, b) => a + b, 0);
    const bestMs = Math.min(...allTimes);
    const avgMs = totalMs / allTimes.length;
    const consistency = Math.max(...allTimes) - Math.min(...allTimes);

    const summary = {
      total_laps: allTimes.length,
      best_lap_ms: bestMs,
      avg_lap_ms: Math.round(avgMs),
      total_time_ms: totalMs,
      consistency_ms: consistency
    };

    // 4) Calcular resumen POR SESIÓN
    const sessions = [];

    for (const [sessionId, data] of sessionsMap.entries()) {
      const times = data.laps.map(l => l.time_ms);
      const total = times.reduce((a, b) => a + b, 0);

      data.summary = {
        laps: times.length,
        best_ms: Math.min(...times),
        avg_ms: Math.round(total / times.length),
        total_ms: total,
        consistency_ms: Math.max(...times) - Math.min(...times)
      };

      sessions.push({
        id: sessionId,
        name: data.session.name,
        type: data.session.type,
        ...data.summary
      });
    }

    // 5) Preparar vuelta a vuelta (ordenado)
    const laps = rows.map(r => ({
      session_id: r.session_id,
      session_name: r.session_name,
      lap: r.lap_number,
      time_ms: r.lap_time_ms,
      driver_name: r.driver_name
    }));

    res.json({ summary, sessions, laps });

  } catch (err) {
    console.error("❌ kart number history error:", err);
    res.status(500).json({ error: "Error loading kart history" });
  }
});


// =====================================================
// HISTORIAL DE KART POR ID (ENVUELVE A LA RUTA PRINCIPAL)
// GET /api/karts/:id/history
// =====================================================
router.get("/:id/history", async (req, res) => {
  try {
    const kartId = Number(req.params.id);
    const { rows } = await pool.query("SELECT number FROM karts WHERE id=$1", [kartId]);
    if (!rows.length) return res.json({
      summary: { total_laps: 0, best_lap: null, worst_lap: null, avg_lap: null },
      sessions: [],
      laps: []
    });

    // Reusar la lógica principal por número visible
    req.params.number = rows[0].number;
    return router.handle(req, res);
  } catch (err) {
    console.error("❌ kart id history error", err);
    res.status(500).json({ error: "Error loading kart history" });
  }
});

// =======================
// PDF HISTORIAL DE KART
// GET /api/karts/:id/history/pdf
// =======================
router.get("/:id/history/pdf", async (req, res) => {
  try {
    const kartId = Number(req.params.id);

    const { rows } = await pool.query(`
      SELECT
        k.number,
        h.created_at,
        h.event_type,
        h.description,
        h.hours
      FROM kart_history h
      JOIN karts k ON k.id = h.kart_id
      WHERE k.id = $1
      ORDER BY h.created_at DESC
    `, [kartId]);

    if (!rows.length) return res.status(404).send("Sin historial");

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=kart-${rows[0].number}-history.pdf`
    );

    doc.pipe(res);
    doc.fontSize(18).text(`Historial Kart #${rows[0].number}`);
    doc.moveDown();

    rows.forEach(h => {
      doc.fontSize(10)
        .text(
          `${new Date(h.created_at).toLocaleString()} | ${h.event_type.toUpperCase()} | ${h.hours || "-"}h`
        )
        .text(h.description || "-")
        .moveDown(0.5);
    });

    doc.end();
  } catch (err) {
    console.error("❌ PDF kart history error", err);
    res.status(500).end();
  }
});

// =======================
// KARTS LIBRES EN SESIÓN
// GET /api/karts/free?session=ID
// =======================
router.get("/free", async (req, res) => {
  try {
    const sessionId = Number(req.query.session);
    if (!Number.isInteger(sessionId) || sessionId <= 0) return res.json([]);

   const { rows } = await pool.query(`
  SELECT k.id, k.number
  FROM karts k
  WHERE k.active = true
    AND k.is_disabled = false   -- 🔴 IMPORTANTE
    AND NOT EXISTS (
      SELECT 1
      FROM session_participants sp
      WHERE sp.session_id = $1
        AND sp.kart_id = k.id
    )
  ORDER BY k.number
`, [sessionId]);

    res.json(rows);
  } catch (err) {
    console.error("❌ GET free karts error:", err);
    res.status(500).json({ error: "Error cargando karts libres" });
  }
});

// =======================
// GET KART POR ID
// GET /api/karts/:id
// =======================
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const { rows } = await pool.query("SELECT * FROM karts WHERE id=$1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Kart no encontrado" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET kart error:", err);
    res.status(500).json({ error: "Error cargando kart" });
  }
});

// =======================
// GET KARTS (ACTIVOS)
// GET /api/karts
// =======================
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM karts WHERE active=true ORDER BY number ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET karts error:", err);
    res.status(500).json({ error: "Error cargando karts" });
  }
});

// =======================
// CREATE KART
// POST /api/karts
// =======================
router.post("/", async (req, res) => {
  try {
    const { number, transponder, notes } = req.body;
    const kartNumber = Number(number);
    if (!Number.isInteger(kartNumber) || kartNumber <= 0) {
      return res.status(400).json({ error: "Número de kart inválido" });
    }

    const { rows } = await pool.query(`
      INSERT INTO karts (number, transponder, notes)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [kartNumber, transponder || null, notes || null]);

    await pool.query(`
      INSERT INTO kart_history (kart_id, event_type, description)
      VALUES ($1, 'create', 'Alta de kart')
    `, [rows[0].id]);

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ POST kart error:", err);
    res.status(500).json({ error: "Error creando kart" });
  }
});

// =======================
// UPDATE KART
// PUT /api/karts/:id
// =======================
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { number, transponder, notes, status } = req.body;

    const { rows } = await pool.query(`
      UPDATE karts SET
        number = $1,
        transponder = $2,
        notes = $3,
        status = $4
      WHERE id = $5
      RETURNING *
    `, [number, transponder || null, notes || null, status || "ok", id]);

    await pool.query(`
      INSERT INTO kart_history (kart_id, event_type, description)
      VALUES ($1, 'edit', 'Edición desde panel admin')
    `, [id]);

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ PUT kart error:", err);
    res.status(500).json({ error: "Error actualizando kart" });
  }
});

// =======================
// DELETE (DESACTIVAR) KART
// DELETE /api/karts/:id
// =======================
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.query("UPDATE karts SET active=false WHERE id=$1", [id]);

    await pool.query(`
      INSERT INTO kart_history (kart_id, event_type, description)
      VALUES ($1, 'disable', 'Kart desactivado')
    `, [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ DELETE kart error:", err);
    res.status(500).json({ error: "Error desactivando kart" });
  }
});

// =======================
// REPORTE PDF DE KART
// GET /api/karts/:id/report/pdf
// =======================
router.get("/:id/report/pdf", async (req, res) => {
  const kartId = Number(req.params.id);

  const { rows: summary } = await pool.query(`
    SELECT
      k.number,
      k.status,
      k.hours_used,
      k.last_service,
      COUNT(DISTINCT h.session_id) AS total_sessions
    FROM karts k
    LEFT JOIN kart_history h ON h.kart_id = k.id AND h.event_type='session'
    WHERE k.id = $1
    GROUP BY k.id
  `, [kartId]);

  if (!summary.length) return res.status(404).end();

  const { rows: sessions } = await pool.query(`
    SELECT
      s.name,
      s.type,
      s.started_at,
      h.hours
    FROM kart_history h
    JOIN sessions s ON s.id = h.session_id
    WHERE h.kart_id = $1
      AND h.event_type = 'session'
    ORDER BY s.started_at DESC
  `, [kartId]);

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=kart-${summary[0].number}-reporte.pdf`
  );

  doc.pipe(res);
  doc.fontSize(18).text(`Reporte de kart #${summary[0].number}`);
  doc.moveDown();
  doc.fontSize(11).text(`Estado: ${summary[0].status.toUpperCase()}`);
  doc.text(`Total sesiones: ${summary[0].total_sessions}`);
  doc.text(`Horas acumuladas: ${summary[0].hours_used}`);
  doc.text(`Último servicio: ${summary[0].last_service || "-"}`);
  doc.moveDown();

  doc.fontSize(12).text("Sesiones");
  doc.moveDown(0.5);

  if (!sessions.length) {
    doc.text("Sin sesiones registradas");
  } else {
    sessions.forEach(s => {
      doc.fontSize(10).text(
        `${s.started_at.toLocaleDateString()} | ${s.name} | ${s.type} | ${s.hours}h`
      );
    });
  }

  doc.end();
});
// =======================
// ANULAR KART (AVERÍA EN PISTA)
// PUT /api/karts/:id/disable
// =======================
router.put("/:id/disable", async (req, res) => {
  const kartId = Number(req.params.id);
  const reason = req.body?.reason || "Avería en pista";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Marcar como fuera de servicio
    await client.query(`
      UPDATE karts
      SET is_disabled = true,
          disabled_reason = $2,
          disabled_at = NOW()
      WHERE id = $1
    `, [kartId, reason]);

    // 2) Buscar participantes asignados a este kart
    const { rows: participants } = await client.query(`
      SELECT id, session_id
      FROM session_participants
      WHERE kart_id = $1
    `, [kartId]);

    // 3) Guardar backup
    for (const p of participants) {
      await client.query(`
        INSERT INTO kart_disabled_assignments
        (kart_id, session_id, participant_id)
        VALUES ($1, $2, $3)
      `, [kartId, p.session_id, p.id]);
    }

    // 4) Quitar kart de la sesión
    await client.query(`
      UPDATE session_participants
      SET kart_id = NULL
      WHERE kart_id = $1
    `, [kartId]);

    await client.query(`
      INSERT INTO kart_history (kart_id, event_type, description)
      VALUES ($1, 'disable_runtime', $2)
    `, [kartId, reason]);

    await client.query("COMMIT");

    res.json({ ok: true, removed_from: participants.length });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ disable kart error:", err);
    res.status(500).json({ error: "Error anulando kart" });
  } finally {
    client.release();
  }
});
// =======================
// REPARAR KART
// PUT /api/karts/:id/enable
// =======================
router.put("/:id/enable", async (req, res) => {
  const kartId = Number(req.params.id);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      UPDATE karts
      SET is_disabled = false,
          disabled_reason = NULL,
          disabled_at = NULL
      WHERE id = $1
    `, [kartId]);

    const { rows: backups } = await client.query(`
      SELECT id, session_id, participant_id
      FROM kart_disabled_assignments
      WHERE kart_id = $1 AND active = true
      ORDER BY removed_at ASC
    `, [kartId]);

    let restored = 0;

    for (const b of backups) {
      const result = await client.query(`
        UPDATE session_participants
        SET kart_id = $1
        WHERE id = $2
          AND session_id = $3
          AND kart_id IS NULL
      `, [kartId, b.participant_id, b.session_id]);

      if (result.rowCount === 1) {
        restored++;

        await client.query(`
          UPDATE kart_disabled_assignments
          SET active = false,
              restored_at = NOW()
          WHERE id = $1
        `, [b.id]);
      }
    }

    await client.query(`
      INSERT INTO kart_history (kart_id, event_type, description)
      VALUES ($1, 'enable_runtime', 'Kart reparado y reactivado')
    `, [kartId]);

    await client.query("COMMIT");

    res.json({ ok: true, restored });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ enable kart error:", err);
    res.status(500).json({ error: "Error reactivando kart" });
  } finally {
    client.release();
  }
});
module.exports = router;
