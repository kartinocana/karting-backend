const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../../db");

/**
 * MODELO FINAL:
 * - Competición: driver trae transponder -> drivers.transponder
 * - Alquiler: transponder viene del kart -> karts.transponder
 * - Override de sesión: session_participants.transponder (prioridad máxima)
 *
 * effective_transponder = COALESCE(sp.transponder, d.transponder, k.transponder)
 *
 * IMPORTANTE:
 * - Se recomienda: siempre haya driver_id (aunque no tenga transponder) porque es “piloto”.
 * - Pero para máxima flexibilidad, este router permite driver_id null si hay kart_id.
 */

function isPosInt(n) {
  return Number.isInteger(n) && n > 0;
}

async function assertDriverExists(client, driverId) {
  const r = await client.query("SELECT id FROM drivers WHERE id=$1", [driverId]);
  if (r.rowCount === 0) {
    const e = new Error("driver_id no existe");
    e.status = 400;
    throw e;
  }
}

async function assertKartExists(client, kartId) {
  const r = await client.query("SELECT id FROM karts WHERE id=$1", [kartId]);
  if (r.rowCount === 0) {
    const e = new Error("kart_id no existe");
    e.status = 400;
    throw e;
  }
}

async function assertDriverNotDuplicatedInSession(client, sessionId, driverId, exceptParticipantId = null) {
  if (!isPosInt(driverId)) return;
  const r = await client.query(
    `
    SELECT id
    FROM session_participants
    WHERE session_id=$1 AND driver_id=$2
      AND ($3::int IS NULL OR id <> $3)
    LIMIT 1
    `,
    [sessionId, driverId, exceptParticipantId]
  );
  if (r.rowCount > 0) {
    const e = new Error("Piloto ya inscrito en la sesión");
    e.status = 409;
    throw e;
  }
}

async function assertKartNotDuplicatedInSession(client, sessionId, kartId, exceptParticipantId = null) {
  if (!isPosInt(kartId)) return;
  const r = await client.query(
    `
    SELECT id
    FROM session_participants
    WHERE session_id=$1 AND kart_id=$2
      AND ($3::int IS NULL OR id <> $3)
    LIMIT 1
    `,
    [sessionId, kartId, exceptParticipantId]
  );
  if (r.rowCount > 0) {
    const e = new Error("Kart ya asignado en la sesión");
    e.status = 409;
    throw e;
  }
}
// =====================================================
// GET PARTICIPANTS
// GET /api/sessions/:id/participants
// =====================================================
router.get("/", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!isPosInt(sessionId)) {
      return res.status(400).json({ error: "session id inválido" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        sp.id,
        sp.session_id,
        sp.driver_id,
        sp.kart_id,
        sp.grid_position,

        d.name AS driver_name,
        d.skill AS driver_category,
        d.weight_kg AS driver_weight,

        k.number AS kart_number,

        -- transponder efectivo (prioridad sesión > driver > kart)
        COALESCE(
          sp.transponder,
          d.transponder,
          k.transponder
        ) AS transponder

      FROM session_participants sp
      LEFT JOIN drivers d ON d.id = sp.driver_id
      LEFT JOIN karts k ON k.id = sp.kart_id
      WHERE sp.session_id = $1
      ORDER BY sp.grid_position NULLS LAST, sp.id
      `,
      [sessionId]
    );

    // ✅ SIEMPRE array (aunque esté vacío)
    res.json(rows);
  } catch (err) {
    console.error("❌ GET participants error:", err);
    res.status(500).json({ error: "Error cargando participantes" });
  }
});


// =====================================================
// POST PARTICIPANT (UNO)
// POST /api/sessions/:id/participants
// body: { driver_id?, kart_id?, grid_position?, transponder? }
// REGLA: debe venir driver_id o kart_id (al menos 1)
// =====================================================
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.id);
    const driver_id = req.body.driver_id != null ? Number(req.body.driver_id) : null;
    const kart_id = req.body.kart_id != null ? Number(req.body.kart_id) : null;
    const grid_position = req.body.grid_position != null ? Number(req.body.grid_position) : null;
    const transponder = req.body.transponder != null ? String(req.body.transponder) : null;

    if (!isPosInt(sessionId)) {
      return res.status(400).json({ error: "session id inválido" });
    }

    if (!isPosInt(driver_id) && !isPosInt(kart_id)) {
      return res.status(400).json({ error: "Debes indicar driver_id o kart_id" });
    }

    await client.query("BEGIN");

    if (isPosInt(driver_id)) await assertDriverExists(client, driver_id);
    if (isPosInt(kart_id)) {
  await assertKartExists(client, kart_id);
  await assertKartAssignable(client, kart_id); // 🔒 nuevo
}

    // Evitar duplicados razonables
    if (isPosInt(driver_id)) await assertDriverNotDuplicatedInSession(client, sessionId, driver_id, null);
    if (isPosInt(kart_id)) await assertKartNotDuplicatedInSession(client, sessionId, kart_id, null);

    const { rows } = await client.query(
      `
      INSERT INTO session_participants
        (session_id, driver_id, kart_id, grid_position, transponder)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id AS participant_id, session_id, driver_id, kart_id, grid_position, transponder
      `,
      [
        sessionId,
        isPosInt(driver_id) ? driver_id : null,
        isPosInt(kart_id) ? kart_id : null,
        Number.isInteger(grid_position) ? grid_position : null,
        transponder || null,
      ]
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const status = err.status || 500;
    console.error("❌ POST participant error:", err);
    res.status(status).json({ error: err.message || "Error creando participante" });
  } finally {
    client.release();
  }
});

// =====================================================
// POST PARTICIPANTS (BULK PARRILLA COMPLETA)
// POST /api/sessions/:id/participants/bulk
// body: { participants: [{ driver_id?, kart_id?, grid_position?, transponder? }, ...] }
// =====================================================
router.post("/bulk", async (req, res) => {
  const sessionId = Number(req.params.id);
  const { participants } = req.body;

  if (!isPosInt(sessionId)) {
    return res.status(400).json({ error: "session id inválido" });
  }
  if (!Array.isArray(participants)) {
    return res.status(400).json({ error: "participants inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // borrar parrilla previa
    await client.query("DELETE FROM session_participants WHERE session_id = $1", [sessionId]);

    // para evitar duplicados en el bulk
    const seenDrivers = new Set();
    const seenKarts = new Set();

    for (const p of participants) {
      const driver_id = p.driver_id != null ? Number(p.driver_id) : null;
      const kart_id = p.kart_id != null ? Number(p.kart_id) : null;
      const grid_position = p.grid_position != null ? Number(p.grid_position) : null;
      const transponder = p.transponder != null ? String(p.transponder) : null;

      // Debe venir driver o kart
      if (!isPosInt(driver_id) && !isPosInt(kart_id)) continue;

      if (isPosInt(driver_id)) {
        if (seenDrivers.has(driver_id)) continue;
        await assertDriverExists(client, driver_id);
        seenDrivers.add(driver_id);
      }
      if (isPosInt(kart_id)) {
        if (seenKarts.has(kart_id)) continue;
        await assertKartExists(client, kart_id);
await assertKartAssignable(client, kart_id);
        seenKarts.add(kart_id);
      }

      await client.query(
        `
        INSERT INTO session_participants
          (session_id, driver_id, kart_id, grid_position, transponder)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          sessionId,
          isPosInt(driver_id) ? driver_id : null,
          isPosInt(kart_id) ? kart_id : null,
          Number.isInteger(grid_position) ? grid_position : null,
          transponder || null,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ BULK participants error:", err);
    res.status(500).json({ error: "Error guardando parrilla" });
  } finally {
    client.release();
  }
});

// =====================================================
// PUT PARTICIPANT
// PUT /api/sessions/:id/participants/:participantId
// body: { driver_id?, kart_id?, transponder?, grid_position? }
// =====================================================
router.put("/:participantId", async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.id);
    const participantId = Number(req.params.participantId);

    if (!isPosInt(sessionId)) {
      return res.status(400).json({ error: "session id inválido" });
    }
    if (!isPosInt(participantId)) {
      return res.status(400).json({ error: "participant id inválido" });
    }

    // Cargar actual
    const cur = await client.query(
      "SELECT id, session_id, driver_id, kart_id FROM session_participants WHERE id=$1 AND session_id=$2",
      [participantId, sessionId]
    );
    if (cur.rowCount === 0) {
      return res.status(404).json({ error: "participant no encontrado" });
    }

    const driver_id = req.body.driver_id !== undefined
      ? (req.body.driver_id == null ? null : Number(req.body.driver_id))
      : undefined;

    const kart_id = req.body.kart_id !== undefined
      ? (req.body.kart_id == null ? null : Number(req.body.kart_id))
      : undefined;

    const grid_position = req.body.grid_position !== undefined
      ? (req.body.grid_position == null ? null : Number(req.body.grid_position))
      : undefined;

    const transponder = req.body.transponder !== undefined
      ? (req.body.transponder == null ? null : String(req.body.transponder))
      : undefined;

    await client.query("BEGIN");

    // Validaciones FK + duplicados
    if (driver_id !== undefined) {
      if (driver_id !== null && !isPosInt(driver_id)) {
        const e = new Error("driver_id inválido");
        e.status = 400;
        throw e;
      }
      if (isPosInt(driver_id)) {
        await assertDriverExists(client, driver_id);
        await assertDriverNotDuplicatedInSession(client, sessionId, driver_id, participantId);
      }
    }

    if (kart_id !== undefined) {
      if (kart_id !== null && !isPosInt(kart_id)) {
        const e = new Error("kart_id inválido");
        e.status = 400;
        throw e;
      }
      if (isPosInt(kart_id)) {
     await assertKartExists(client, kart_id);
await assertKartAssignable(client, kart_id);
await assertKartNotDuplicatedInSession(client, sessionId, kart_id, participantId);
      }
    }

    // No permitir que quede sin driver y sin kart
    const nextDriver = (driver_id === undefined) ? cur.rows[0].driver_id : driver_id;
    const nextKart = (kart_id === undefined) ? cur.rows[0].kart_id : kart_id;
    if (!isPosInt(nextDriver) && !isPosInt(nextKart)) {
      const e = new Error("Un participant no puede quedar sin driver_id y sin kart_id");
      e.status = 400;
      throw e;
    }

    // Construir update dinámico
    const sets = [];
    const params = [];
    let p = 1;

    if (driver_id !== undefined) {
      sets.push(`driver_id = $${p++}`);
      params.push(driver_id);
    }
    if (kart_id !== undefined) {
      sets.push(`kart_id = $${p++}`);
      params.push(kart_id);
    }
    if (grid_position !== undefined) {
      sets.push(`grid_position = $${p++}`);
      params.push(Number.isInteger(grid_position) ? grid_position : null);
    }
    if (transponder !== undefined) {
      sets.push(`transponder = $${p++}`);
      params.push(transponder);
    }

    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ ok: true });
    }

    params.push(participantId);
    params.push(sessionId);

    await client.query(
      `
      UPDATE session_participants
      SET ${sets.join(", ")}
      WHERE id = $${p++} AND session_id = $${p++}
      `,
      params
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const status = err.status || 500;
    console.error("❌ PUT participant error:", err);
    res.status(status).json({ error: err.message || "Error actualizando participante" });
  } finally {
    client.release();
  }
});

// =====================================================
// DELETE PARTICIPANT
// DELETE /api/sessions/:id/participants/:participantId
// =====================================================
router.delete("/:participantId", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const participantId = Number(req.params.participantId);

    if (!isPosInt(sessionId)) {
      return res.status(400).json({ error: "session id inválido" });
    }
    if (!isPosInt(participantId)) {
      return res.status(400).json({ error: "participant id inválido" });
    }

    await pool.query(
      "DELETE FROM session_participants WHERE id = $1 AND session_id = $2",
      [participantId, sessionId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ DELETE participant error:", err);
    res.status(500).json({ error: "Error eliminando participante" });
  }
});
// 🔒 NO PERMITIR ASIGNAR KART ANULADO
// 🔒 NO PERMITIR ASIGNAR KART ANULADO
async function assertKartAssignable(client, kartId) {
  if (!isPosInt(kartId)) return;

  const r = await client.query(
    "SELECT number, is_disabled FROM karts WHERE id=$1",
    [kartId]
  );

  if (r.rowCount === 0) {
    const e = new Error("kart_id no existe");
    e.status = 400;
    throw e;
  }

  if (r.rows[0].is_disabled) {
    const e = new Error(`Kart #${r.rows[0].number} está FUERA DE SERVICIO`);
    e.status = 409;
    throw e;
  }
}
module.exports = router;


