const express = require("express");
const router = express.Router();

// Usamos TU pool ya configurado (el que sí conecta bien)
const pool = require("../../db");
// =========================================================
// POST /api/championships/:championshipId/import-session/:sessionId
// =========================================================
router.post("/:championshipId/import-session/:sessionId", async (req, res) => {
  const { championshipId, sessionId } = req.params;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("📥 Importando sesión:", sessionId, "al campeonato:", championshipId);

    // ======================================================
    // 1) VINCULAR SESIÓN → CARRERA DE CAMPEONATO
    // ======================================================

    let championshipRaceId;

    const raceRes = await client.query(
      `
      SELECT id 
      FROM kart_champ.championship_races
      WHERE championship_id = $1
        AND racecontrol_session_id = $2
      LIMIT 1
      `,
      [championshipId, sessionId]
    );

    if (raceRes.rows.length > 0) {
      championshipRaceId = raceRes.rows[0].id;
      console.log("♻️ Usando carrera existente:", championshipRaceId);
    } else {
      const createRace = await client.query(
        `
        INSERT INTO kart_champ.championship_races
          (championship_id, racecontrol_session_id, name, race_type, status)
        VALUES ($1, $2, $3, 'speed', 'finished')
        RETURNING id
        `,
        [
          championshipId,
          sessionId,
          `Carrera - Sesión ${sessionId}`
        ]
      );

      championshipRaceId = createRace.rows[0].id;
      console.log("🆕 Creada nueva carrera:", championshipRaceId);
    }

    // ======================================================
    // 2) LEER VUELTAS (JOIN CORRECTO PARA TU DB)
    // ======================================================

    const lapsRes = await client.query(
      `
      SELECT
        se.driver_id AS racecontrol_driver_id,
        COUNT(le.id) AS laps,
        SUM(le.lap_time_ms) AS total_time_ms,
        MIN(le.lap_time_ms) AS best_lap_ms
      FROM public.lap_events le
      JOIN public.session_entries se
        ON se.kart_id = le.entry_id      -- ✅ CLAVE CORRECTA EN TU SISTEMA
      WHERE se.session_id = $1::int
        AND le.lap_time_ms IS NOT NULL
      GROUP BY se.driver_id
      ORDER BY COUNT(le.id) DESC, SUM(le.lap_time_ms) ASC
      `,
      [sessionId]
    );

    console.log("Vueltas leídas:", lapsRes.rows.length);

    if (lapsRes.rows.length === 0) {
      throw new Error(
        "No hay vueltas en public.lap_events para esta sesión"
      );
    }

    // ======================================================
    // 3) LEER PENALIZACIONES (si existen)
    // ======================================================

    const penaltiesRes = await client.query(
      `
      SELECT
        p.participant_id AS racecontrol_driver_id,
        COALESCE(p.value_ms, 0) AS value_ms
      FROM public.penalties p
      WHERE p.session_id = $1
      `,
      [sessionId]
    );

    const penaltiesByDriver = {};

    for (const p of penaltiesRes.rows) {
      if (!penaltiesByDriver[p.racecontrol_driver_id]) {
        penaltiesByDriver[p.racecontrol_driver_id] = { timeMs: 0 };
      }
      penaltiesByDriver[p.racecontrol_driver_id].timeMs += p.value_ms;
    }

    // ======================================================
    // 4) LIMPIAR RESULTADOS PREVIOS DE ESTA CARRERA
    // ======================================================

    await client.query(
      `
      DELETE FROM kart_champ.race_results
      WHERE championship_race_id = $1
      `,
      [championshipRaceId]
    );

    // ======================================================
    // 5) CALCULAR POSICIONES + INSERTAR RESULTADOS
    // ======================================================

    let position = 1;

    for (const row of lapsRes.rows) {
      const penaltyMs =
        penaltiesByDriver[row.racecontrol_driver_id]?.timeMs || 0;

      const adjustedTime =
        Number(row.total_time_ms) + Number(penaltyMs);

      const basePoints = POINTS_BY_POSITION[position] || 0;

      const lapsBonus =
        row.laps >= BONUS_MIN_LAPS ? BONUS_LAPS_POINT : 0;

      const bestLapDriverId = lapsRes.rows.reduce((best, r) =>
        (!best || r.best_lap_ms < best.best_lap_ms) ? r : best,
        null
      )?.racecontrol_driver_id;

      const bestLapBonus =
        row.racecontrol_driver_id === bestLapDriverId
          ? BONUS_BEST_LAP
          : 0;

      const totalPoints = basePoints + lapsBonus + bestLapBonus;

      await client.query(
        `
        INSERT INTO kart_champ.race_results
          (championship_race_id,
           racecontrol_driver_id,
           position,
           laps,
           total_time_ms,
           best_lap_ms,
           points,
           bonus_points)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          championshipRaceId,
          row.racecontrol_driver_id,
          position,
          row.laps,
          adjustedTime,
          row.best_lap_ms,
          totalPoints,
          lapsBonus + bestLapBonus
        ]
      );

      position++;
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      championshipRaceId,
      importedDrivers: lapsRes.rows.length
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("IMPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ======================================================
// 🎯 SISTEMA DE PUNTOS (CONFIGURABLE)
// ======================================================
const POINTS_BY_POSITION = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4,
  9: 2,
  10: 1
};

// BONUS
const BONUS_BEST_LAP = 1;
const BONUS_MIN_LAPS = 8;
const BONUS_LAPS_POINT = 1;

module.exports = router;
