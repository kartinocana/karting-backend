// backend/src/routes/championshipRounds.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ======================================================
// 1) CREAR PRUEBA (ROUND)
// POST /api/championships/:champId/rounds
// ======================================================
router.post("/:champId/rounds", async (req, res) => {
  const { champId } = req.params;
  const { name, round_date } = req.body;

  if (!name) return res.status(400).json({ error: "name es obligatorio" });

  try {
    const q = `
      INSERT INTO kart_champ.championship_rounds
      (championship_id, name, round_date)
      VALUES ($1,$2,$3)
      RETURNING *;
    `;
    const r = await pool.query(q, [champId, name, round_date || null]);
    res.json(r.rows[0]);
  } catch (e) {
    console.error("ROUND POST ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 2) LISTAR PRUEBAS
// GET /api/championships/:champId/rounds
// ======================================================
router.get("/:champId/rounds", async (req, res) => {
  try {
    const q = `
      SELECT * FROM kart_champ.championship_rounds
      WHERE championship_id = $1
      ORDER BY round_date NULLS LAST;
    `;
    const r = await pool.query(q, [req.params.champId]);
    res.json(r.rows);
  } catch (e) {
    console.error("ROUND GET ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 3) CREAR SESIÓN MANUAL POR CATEGORÍA (solo vínculo)
// POST /api/championships/:champId/rounds/:roundId/sessions
// ======================================================
router.post("/:champId/rounds/:roundId/sessions", async (req, res) => {
  const { roundId } = req.params;
  const { category, session_type, event_name, racecontrol_session_id } = req.body;

  if (!category || !session_type || !event_name) {
    return res.status(400).json({ error: "faltan campos obligatorios" });
  }

  try {
    const q = `
      INSERT INTO kart_champ.round_sessions
      (round_id, category, session_type, event_name, racecontrol_session_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *;
    `;
    const r = await pool.query(q, [
      roundId,
      category,
      session_type,
      event_name,
      racecontrol_session_id || null
    ]);

    res.json(r.rows[0]);
  } catch (e) {
    console.error("SESSION POST ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 4) LISTAR SESIONES DE UNA PRUEBA
// GET /api/championships/:champId/rounds/:roundId/sessions
// ======================================================
router.get("/:champId/rounds/:roundId/sessions", async (req, res) => {
  try {
    const q = `
      SELECT * FROM kart_champ.round_sessions
      WHERE round_id = $1
      ORDER BY category, session_type;
    `;
    const r = await pool.query(q, [req.params.roundId]);
    res.json(r.rows);
  } catch (e) {
    console.error("ROUND SESSIONS GET ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 5) INSCRIBIR PILOTO A CATEGORÍA DE UNA PRUEBA
// POST /api/championships/:champId/rounds/:roundId/enroll
// ======================================================
router.post("/:champId/rounds/:roundId/enroll", async (req, res) => {
  const { roundId } = req.params;
  const { category, racecontrol_driver_id, kart_id } = req.body;

  if (!category || !racecontrol_driver_id) {
    return res.status(400).json({ error: "faltan campos obligatorios" });
  }

  try {
    const q = `
      INSERT INTO kart_champ.round_participants
      (round_id, category, racecontrol_driver_id, kart_id)
      VALUES ($1,$2,$3,$4)
      RETURNING *;
    `;
    const r = await pool.query(q, [
      roundId,
      category,
      racecontrol_driver_id,
      kart_id || null
    ]);

    res.json(r.rows[0]);
  } catch (e) {
    console.error("ENROLL ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 6) LISTAR INSCRITOS DE UNA PRUEBA/CATEGORÍA
// GET /api/championships/:champId/rounds/:roundId/participants?cat=Pro
// ======================================================
router.get("/:champId/rounds/:roundId/participants", async (req, res) => {
  const { roundId } = req.params;
  const { cat } = req.query;

  try {
    const q = `
      SELECT 
        rp.id,
        rp.category,
        rp.racecontrol_driver_id,
        rp.kart_id,
        d.name,
        d.weight,
        d.transponder AS driver_transponder,
        k.transponder AS kart_transponder,
        d.skill AS driver_skill,
        k.number AS kart_number
      FROM kart_champ.round_participants rp
      LEFT JOIN public.drivers d
        ON d.id = rp.racecontrol_driver_id
      LEFT JOIN public.karts k
        ON k.id = rp.kart_id
      WHERE rp.round_id = $1
        AND ($2::text IS NULL OR rp.category = $2)
      ORDER BY d.name;
    `;

    const r = await pool.query(q, [roundId, cat || null]);
    res.json(r.rows);
  } catch (e) {
    console.error("LIST PARTICIPANTS ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 7) CREAR SESIÓN AUTOMÁTICA (solo crea sesión + vínculo)
// POST /api/championships/:champId/rounds/:roundId/sessions/auto
// ======================================================
router.post("/:champId/rounds/:roundId/sessions/auto", async (req, res) => {
  const { roundId } = req.params;
  const { category } = req.body;

  try {
    const sessionInsert = await pool.query(
      `
      INSERT INTO public.sessions (type, name)
      VALUES ($1, $2)
      RETURNING id
      `,
      ["practice", `Sesion Ronda ${roundId} - ${category || "LIBRE"}`]
    );

    const newSessionId = sessionInsert.rows[0].id;

    await pool.query(
      `
      INSERT INTO kart_champ.round_sessions
      (round_id, category, session_type, event_name, racecontrol_session_id)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [roundId, category || "LIBRE", "AUTO", `Sesion Ronda ${roundId}`, newSessionId]
    );

    res.json({
      ok: true,
      sessionId: newSessionId,
      message: "Sesión creada automáticamente"
    });
  } catch (e) {
    console.error("AUTO SESSION ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 8) SYNC PRO FINAL: CREAR SESIÓN + SINCRONIZAR (GLOBAL o por categoría)
// POST /api/championships/:champId/rounds/:roundId/sessions/create-and-sync
//
// ✅ Inserta en session_participants (lo que lee RaceControl)
// ✅ Respeta kart_id MANUAL (rp.kart_id). NO asigna karts.
// ✅ Transponder: prioridad kart > driver (si no hay, null)
// ✅ GLOBAL: si category viene vacío/no viene, mete todos.
// ✅ Crea vínculo en kart_champ.round_sessions
// ======================================================
router.post("/:champId/rounds/:roundId/sessions/create-and-sync", async (req, res) => {
	const visibleName = String(req.body?.visibleName || "").trim();

if(!visibleName){
  return res.status(400).json({error:"visibleName obligatorio"});
}
	
  const { champId, roundId } = req.params;

  // GLOBAL si no viene category
  const category = String(req.body?.category || "").trim(); // "" => global

  // Tipo visible de sesión (texto)
  const sessionTypeLabel = String(req.body?.sessionType || "Carrera").trim();

  // ✅ Nombre claro en RaceControl
  // Ej: "ROTAX MINI — Carrera" | "LIBRE — Qualy" | "GLOBAL — Carrera"
  const sessionName = `${category || "GLOBAL"} — ${sessionTypeLabel}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Crear sesión real (RaceControl)
 const { rows:[sess] } = await client.query(
  `
  INSERT INTO public.sessions (type, name, status)
  VALUES ($1, $2, 'scheduled')
  RETURNING id
  `,
  [
    "practice",
    visibleName   // ← ESTE ES EL CAMBIO
  ]
);
    const sessionId = sess.id;

    // 2) Guardar vínculo con ronda
    await client.query(
      `
      INSERT INTO kart_champ.round_sessions
      (round_id, category, session_type, event_name, racecontrol_session_id)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        Number(roundId),
        category || "GLOBAL",
        "AUTO",
        sessionName,          // ✅ también guardamos el nombre bonito
        sessionId
      ]
    );

    // 3) Leer inscritos (MISMA TABLA que tu UI)
    const { rows: parts } = await client.query(
      `
      SELECT
        rp.racecontrol_driver_id,
        rp.kart_id,
        rp.category,
        d.transponder AS driver_transponder,
        k.transponder AS kart_transponder
      FROM kart_champ.round_participants rp
      LEFT JOIN public.drivers d ON d.id = rp.racecontrol_driver_id
      LEFT JOIN public.karts   k ON k.id = rp.kart_id
      WHERE rp.round_id = $1
        AND ($2 = '' OR rp.category = $2)
      ORDER BY rp.id ASC
      `,
      [Number(roundId), category]
    );

    // 4) Insertar en session_participants (kart manual)
    let inserted = 0;

    for (const p of parts) {
      const driverId = Number(p.racecontrol_driver_id);
      if (!Number.isInteger(driverId) || driverId <= 0) continue;

      const kartT = p.kart_transponder != null ? String(p.kart_transponder).trim() : "";
      const drvT  = p.driver_transponder != null ? String(p.driver_transponder).trim() : "";
      const transponderFinal = (kartT || drvT || null);

      await client.query(
        `
        INSERT INTO public.session_participants
          (session_id, driver_id, kart_id, transponder)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (session_id, driver_id)
        DO UPDATE SET
          kart_id = EXCLUDED.kart_id,
          transponder = EXCLUDED.transponder
        `,
        [
          sessionId,
          driverId,
          p.kart_id ? Number(p.kart_id) : null,
          transponderFinal
        ]
      );

      inserted++;
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      sessionId,
      sessionName, // 👈 útil para depurar/mostrar
      synced: inserted,
      mode: category ? "CATEGORY" : "GLOBAL",
      message: "Sesión creada y pilotos sincronizados (SYNC PRO FINAL)"
    });

  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CREATE+SYNC PRO ERROR:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
// ======================================================
// 9) SYNC PRO: ROUND → SESIÓN EXISTENTE (GLOBAL o por categoría)
// POST /api/championships/:champId/rounds/:roundId/sessions/:sessionId/sync
// body opcional: { category?: "LIBRE" }
// ======================================================
router.post("/:champId/rounds/:roundId/sessions/:sessionId/sync", async (req, res) => {
  const { roundId, sessionId } = req.params;
  const category = String(req.body?.category || "").trim(); // "" => global

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: parts } = await client.query(
      `
      SELECT
        rp.racecontrol_driver_id,
        rp.kart_id,
        rp.category,
        d.transponder AS driver_transponder,
        k.transponder AS kart_transponder
      FROM kart_champ.round_participants rp
      LEFT JOIN public.drivers d ON d.id = rp.racecontrol_driver_id
      LEFT JOIN public.karts   k ON k.id = rp.kart_id
      WHERE rp.round_id = $1
        AND ($2 = '' OR rp.category = $2)
      ORDER BY rp.id ASC
      `,
      [Number(roundId), category]
    );

    if (parts.length === 0) {
      await client.query("COMMIT");
      return res.json({
        ok: true,
        synced: 0,
        sessionId: Number(sessionId),
        mode: category ? "CATEGORY" : "GLOBAL",
        message: "No hay participantes para sincronizar"
      });
    }

    let inserted = 0;

    for (const p of parts) {

      // ✅ PRO: nunca insertes driver_id null/0
      const driverId = Number(p.racecontrol_driver_id);
      if (!Number.isInteger(driverId) || driverId <= 0) continue;

      // ✅ PRO: normalizar transponder (ignorar "", "   ", etc.)
      const kartT = p.kart_transponder != null ? String(p.kart_transponder).trim() : "";
      const drvT  = p.driver_transponder != null ? String(p.driver_transponder).trim() : "";
      const transponderFinal = (kartT || drvT || null);

      const kartId = p.kart_id != null ? Number(p.kart_id) : null;

      await client.query(
        `
        INSERT INTO public.session_participants
          (session_id, driver_id, kart_id, transponder)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (session_id, driver_id)
        DO UPDATE SET
          kart_id = EXCLUDED.kart_id,
          transponder = EXCLUDED.transponder
        `,
        [Number(sessionId), driverId, Number.isFinite(kartId) ? kartId : null, transponderFinal]
      );

      inserted++;
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      synced: inserted,
      sessionId: Number(sessionId),
      mode: category ? "CATEGORY" : "GLOBAL",
      message: "Sincronización completada (SYNC PRO)"
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ROUND→SESSION SYNC PRO ERROR:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
// ======================================================
// 10) BORRAR INSCRIPCIÓN
// DELETE /api/championships/:champId/rounds/enroll/:enrollId
// ======================================================
router.delete("/:champId/rounds/enroll/:enrollId", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM kart_champ.round_participants WHERE id=$1",
      [req.params.enrollId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE ENROLL ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 11) EDITAR ROUND
// PUT /api/championships/:champId/rounds/:roundId
// ======================================================
router.put("/:champId/rounds/:roundId", async (req, res) => {
  const id = Number(req.params.roundId);
  const { name, round_date } = req.body;

  try {
    const q = await pool.query(
      `
      UPDATE kart_champ.championship_rounds
      SET name=$1, round_date=$2
      WHERE id=$3
      RETURNING *
      `,
      [name, round_date || null, id]
    );

    res.json(q.rows[0]);
  } catch (e) {
    console.error("PUT ROUND ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

// ======================================================
// 12) BORRAR ROUND
// DELETE /api/championships/:champId/rounds/:roundId
// ======================================================
router.delete("/:champId/rounds/:roundId", async (req, res) => {
  const id = Number(req.params.roundId);

  try {
    await pool.query(
      `DELETE FROM kart_champ.championship_rounds WHERE id=$1`,
      [id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE ROUND ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;