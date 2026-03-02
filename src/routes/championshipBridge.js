const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * ==========================================================
 * GET /api/championships
 * Lista de campeonatos
 * ==========================================================
 */
router.get("/championships", async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT id, name, season, status, created_at
      FROM kart_champ.championships
      ORDER BY created_at DESC
    `);

    res.json(q.rows);
  } catch (e) {
    console.error("GET championships error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * GET /api/championships/:id/races
 * ==========================================================
 */
router.get("/championships/:id/races", async (req, res) => {
  const champId = Number(req.params.id);

  try {
    const q = await pool.query(`
      SELECT id, championship_id, racecontrol_session_id,
             name, status, created_at
      FROM kart_champ.championship_races
      WHERE championship_id = $1
      ORDER BY created_at ASC
    `, [champId]);

    res.json(q.rows);
  } catch (e) {
    console.error("GET races error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * POST /api/championships/:id/races/:raceId/import-results
 * IMPORTA RESULTADOS DESDE LAPS
 * ==========================================================
 */
router.post(
  "/championships/:id/races/:raceId/import-results",
  async (req, res) => {
    const champId = Number(req.params.id);
    const raceId = Number(req.params.raceId);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1️⃣ obtener session_id vinculada a la carrera
      const raceQ = await client.query(
        `
        SELECT racecontrol_session_id
        FROM kart_champ.championship_races
        WHERE id = $1 AND championship_id = $2
        `,
        [raceId, champId]
      );

      if (!raceQ.rows.length) {
        throw new Error("Carrera no encontrada");
      }

      const sessionId = raceQ.rows[0].racecontrol_session_id;

      // 2️⃣ borrar resultados previos
      await client.query(
        `
        DELETE FROM kart_champ.race_results
        WHERE championship_race_id = $1
        `,
        [raceId]
      );

      // 3️⃣ insertar resultados desde laps
      const insertRes = await client.query(
        `
        INSERT INTO kart_champ.race_results
        (
          championship_race_id,
          racecontrol_driver_id,
          position,
          laps,
          total_time_ms,
          best_lap_ms,
          points
        )
        SELECT
          $1,
          l.driver_id,
          ROW_NUMBER() OVER (
            ORDER BY COUNT(*) DESC,
                     SUM(l.lap_time_ms) ASC
          ) AS position,
          COUNT(*) AS laps,
          SUM(l.lap_time_ms) AS total_time_ms,
          MIN(l.lap_time_ms) AS best_lap_ms,
          0
        FROM public.laps l
        WHERE l.session_id = $2
        GROUP BY l.driver_id
        `,
        [raceId, sessionId]
      );

      await client.query("COMMIT");

      res.json({
        imported: insertRes.rowCount,
        session_id: sessionId
      });

    } catch (e) {
      await client.query("ROLLBACK");
      console.error("IMPORT RESULTS error:", e);
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);

/**
 * ==========================================================
 * GET /api/championships/:id/races/:raceId/results
 * ==========================================================
 */
router.get(
  "/championships/:id/races/:raceId/results",
  async (req, res) => {
    const raceId = Number(req.params.raceId);

    try {
      const q = await pool.query(`
        SELECT
          rr.position,
          rr.racecontrol_driver_id,
          d.name AS driver_name,
          d.skill AS driver_skill,
          rr.laps,
          rr.total_time_ms,
          rr.best_lap_ms,
          rr.points
        FROM kart_champ.race_results rr
        JOIN public.drivers d
          ON d.id = rr.racecontrol_driver_id
        WHERE rr.championship_race_id = $1
        ORDER BY rr.position ASC
      `, [raceId]);

      res.json(q.rows);
    } catch (e) {
      console.error("GET results error:", e);
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * ==========================================================
 * GET /api/championships/:id/standings
 * ==========================================================
 */
router.get("/championships/:id/standings", async (req, res) => {
  const champId = Number(req.params.id);

  try {
    const q = await pool.query(`
      SELECT
        rr.racecontrol_driver_id,
        d.name AS driver_name,
        d.skill AS driver_skill,
        SUM(rr.points) AS total_points
      FROM kart_champ.race_results rr
      JOIN kart_champ.championship_races cr
        ON cr.id = rr.championship_race_id
      JOIN public.drivers d
        ON d.id = rr.racecontrol_driver_id
      WHERE cr.championship_id = $1
      GROUP BY rr.racecontrol_driver_id, d.name, d.skill
      ORDER BY total_points DESC, d.name
    `, [champId]);

    res.json(q.rows);
  } catch (e) {
    console.error("GET standings error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;


