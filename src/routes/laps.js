const express = require("express");
const router = express.Router();
const pool = require("../../db");

const MIRROR_URL = (process.env.MIRROR_URL || "").replace(/\/+$/, "");
const MIRROR_SHARED_KEY = process.env.MIRROR_SHARED_KEY || "";
const NODE_ROLE = (process.env.NODE_ROLE || "local").toLowerCase();

async function mirrorLap(body = {}) {
  if (!MIRROR_URL || !MIRROR_SHARED_KEY) return;

  try {
    await fetch(`${MIRROR_URL}/api/laps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mirror-key": MIRROR_SHARED_KEY
      },
      body: JSON.stringify({
        ...body,
        mirrored: true,
        source: NODE_ROLE
      })
    });
  } catch (err) {
    console.error("❌ mirror lap error:", err.message);
  }
}

function isMirrorAuthorized(req) {
  const key = req.headers["x-mirror-key"];
  return MIRROR_SHARED_KEY && key === MIRROR_SHARED_KEY;
}

let lapsParticipantIdColumnCache = null;

async function lapsHasParticipantIdColumn() {
  if (lapsParticipantIdColumnCache != null) return lapsParticipantIdColumnCache;

  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'laps'
      AND column_name = 'participant_id'
    LIMIT 1
    `
  );

  lapsParticipantIdColumnCache = rows.length > 0;
  return lapsParticipantIdColumnCache;
}

// =====================================================
// GET /api/laps?session_id=123
// LISTAR VUELTAS
// =====================================================
console.log("✅ LAPS ROUTER LOADED");
router.get("/", async (req, res) => {
  try {
    const { session_id } = req.query;
    const hasParticipantId = await lapsHasParticipantIdColumn();

    let sql = "";
    let params = [];

    if (session_id != null) {
      const sessionIdNum = Number(session_id);

      if (!Number.isFinite(sessionIdNum) || sessionIdNum <= 0) {
        return res.status(400).json({ error: "session_id inválido" });
      }

      sql = hasParticipantId
        ? `
          SELECT
            id,
            session_id,
            participant_id,
            driver_id,
            kart_id,
            lap_number,
            lap_time_ms,
            sector1_ms,
            sector2_ms,
            sector3_ms,
            created_at
          FROM laps
          WHERE session_id = $1
          ORDER BY lap_number ASC, id ASC
        `
        : `
          SELECT
            id,
            session_id,
            driver_id,
            kart_id,
            lap_number,
            lap_time_ms,
            sector1_ms,
            sector2_ms,
            sector3_ms,
            created_at
          FROM laps
          WHERE session_id = $1
          ORDER BY lap_number ASC, id ASC
        `;

      params = [sessionIdNum];
    } else {
      sql = hasParticipantId
        ? `
          SELECT
            id,
            session_id,
            participant_id,
            driver_id,
            kart_id,
            lap_number,
            lap_time_ms,
            sector1_ms,
            sector2_ms,
            sector3_ms,
            created_at
          FROM laps
          ORDER BY created_at DESC, id DESC
          LIMIT 500
        `
        : `
          SELECT
            id,
            session_id,
            driver_id,
            kart_id,
            lap_number,
            lap_time_ms,
            sector1_ms,
            sector2_ms,
            sector3_ms,
            created_at
          FROM laps
          ORDER BY created_at DESC, id DESC
          LIMIT 500
        `;
    }

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("❌ GET LAPS ERROR:", err);
    return res.status(500).json({ error: "Error obteniendo vueltas" });
  }
});

// =====================================================
// POST /api/laps
// GUARDAR UNA VUELTA
// =====================================================
router.post("/", async (req, res) => {
  const {
    session_id,
    participant_id,
    driver_id,
    kart_id,
    lap_number,
    lap_time_ms,
    sector1_ms,
    sector2_ms,
    sector3_ms,
    mirrored
  } = req.body;

  if (mirrored === true && !isMirrorAuthorized(req)) {
    return res.status(401).json({
      error: "mirror unauthorized"
    });
  }

  if (!session_id || (!driver_id && !participant_id) || !lap_number || lap_time_ms == null) {
    return res.status(400).json({
      error: "Datos de vuelta incompletos"
    });
  }

  const sessionIdNum = Number(session_id);
  const participantIdNum = participant_id != null ? Number(participant_id) : null;
  const driverIdNum = driver_id != null ? Number(driver_id) : null;
  const kartIdNum = kart_id != null ? Number(kart_id) : null;
  const lapNumberNum = Number(lap_number);
  const lapTimeNum = Number(lap_time_ms);
  const sector1Num = sector1_ms != null ? Number(sector1_ms) : null;
  const sector2Num = sector2_ms != null ? Number(sector2_ms) : null;
  const sector3Num = sector3_ms != null ? Number(sector3_ms) : null;

  if (
    !Number.isFinite(sessionIdNum) ||
    (participantIdNum == null && !Number.isFinite(driverIdNum)) ||
    !Number.isFinite(lapNumberNum) ||
    !Number.isFinite(lapTimeNum)
  ) {
    return res.status(400).json({
      error: "Formato de datos inválido"
    });
  }

  if (lapNumberNum <= 0 || lapTimeNum < 0) {
    return res.status(400).json({
      error: "Valores de vuelta inválidos"
    });
  }

  try {
    const hasParticipantId = await lapsHasParticipantIdColumn();

    let duplicateCheck;

    if (hasParticipantId && participantIdNum != null) {
      duplicateCheck = await pool.query(
        `
        SELECT id
        FROM laps
        WHERE session_id = $1
          AND participant_id = $2
          AND lap_number = $3
        LIMIT 1
        `,
        [sessionIdNum, participantIdNum, lapNumberNum]
      );
    } else {
      duplicateCheck = await pool.query(
        `
        SELECT id
        FROM laps
        WHERE session_id = $1
          AND driver_id = $2
          AND lap_number = $3
        LIMIT 1
        `,
        [sessionIdNum, driverIdNum, lapNumberNum]
      );
    }

    if (duplicateCheck.rows.length > 0) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        lap: { id: duplicateCheck.rows[0].id }
      });
    }

    const insertSql = hasParticipantId
      ? `
        INSERT INTO laps (
          session_id,
          participant_id,
          driver_id,
          kart_id,
          lap_number,
          lap_time_ms,
          sector1_ms,
          sector2_ms,
          sector3_ms
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, session_id, participant_id, driver_id, kart_id, lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, created_at
      `
      : `
        INSERT INTO laps (
          session_id,
          driver_id,
          kart_id,
          lap_number,
          lap_time_ms,
          sector1_ms,
          sector2_ms,
          sector3_ms
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, session_id, driver_id, kart_id, lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, created_at
      `;

    const insertParams = hasParticipantId
      ? [
          sessionIdNum,
          participantIdNum,
          driverIdNum,
          kartIdNum,
          lapNumberNum,
          lapTimeNum,
          sector1Num,
          sector2Num,
          sector3Num
        ]
      : [
          sessionIdNum,
          driverIdNum,
          kartIdNum,
          lapNumberNum,
          lapTimeNum,
          sector1Num,
          sector2Num,
          sector3Num
        ];

    const result = await pool.query(insertSql, insertParams);

    if (mirrored !== true) {
      await mirrorLap({
        session_id: sessionIdNum,
        participant_id: participantIdNum,
        driver_id: driverIdNum,
        kart_id: kartIdNum,
        lap_number: lapNumberNum,
        lap_time_ms: lapTimeNum,
        sector1_ms: sector1Num,
        sector2_ms: sector2Num,
        sector3_ms: sector3Num
      });
    }

    return res.status(201).json({
      ok: true,
      mirrored: mirrored !== true,
      lap: result.rows[0]
    });
  } catch (err) {
    console.error("❌ INSERT LAP ERROR:", err);
    return res.status(500).json({
      error: "Error guardando vuelta"
    });
  }
});

module.exports = router;
