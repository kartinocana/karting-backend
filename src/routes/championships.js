const express = require("express");
const router = express.Router();
const pool = require("../../db");
/**
 * ==========================================================
 * GET /api/championships
 * Listar campeonatos
 * ==========================================================
 */
router.get("/", async (req, res) => {
  try {
    const q = await pool.query(
      `
      SELECT id, name, season
      FROM kart_champ.championships
      ORDER BY id DESC
      `
    );
    res.json(q.rows);
  } catch (e) {
    console.error("GET championships error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * POST /api/championships
 * Crear campeonato
 * body: { name, season }
 * ==========================================================
 */
router.post("/", async (req, res) => {
  try {
    const { name, season } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Missing name" });
    }

    const seasonVal =
      season === null || season === undefined || season === ""
        ? null
        : Number(season);

    if (seasonVal !== null && !Number.isFinite(seasonVal)) {
      return res.status(400).json({ error: "Invalid season" });
    }

    const q = await pool.query(
      `
      INSERT INTO kart_champ.championships (name, season)
      VALUES ($1, $2)
      RETURNING id, name, season
      `,
      [String(name).trim(), seasonVal]
    );

    res.status(201).json(q.rows[0]);
  } catch (e) {
    console.error("POST championships error:", e);
    res.status(500).json({ error: e.message });
  }
});
/**
 * ==========================================================
 * GET /api/championships/:id/races
 * Lista de carreras del campeonato
 * ==========================================================
 */
router.get("/:id/races", async (req, res) => {
  const champId = Number(req.params.id);

  try {
    const q = await pool.query(
      `
      SELECT
        id,
        championship_id,
        racecontrol_session_id,
        name,
        status,
        created_at
      FROM kart_champ.championship_races
      WHERE championship_id = $1
      ORDER BY created_at ASC
      `,
      [champId]
    );

    res.json(q.rows);
  } catch (e) {
    console.error("GET races error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * GET /api/championships/:id/races/:raceId/results
 * Resultados de una carrera (para dashboard)
 * ==========================================================
 */
router.get("/:id/races/:raceId/results", async (req, res) => {
  const raceId = Number(req.params.raceId);

  try {
    const q = await pool.query(
      `
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
      `,
      [raceId]
    );

    res.json(q.rows);
  } catch (e) {
    console.error("GET results error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * GET /api/championships/:id/standings
 * Clasificación general acumulada del campeonato
 * ==========================================================
 */
router.get("/:id/standings", async (req, res) => {
  const champId = Number(req.params.id);

  try {
    const q = await pool.query(
      `
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
      `,
      [champId]
    );

    res.json(q.rows);
  } catch (e) {
    console.error("GET standings error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ==========================================================
 * DELETE /api/championships/:id
 * Borrado TOTAL (participantes + resultados + carreras + campeonato)
 * ==========================================================
 */
router.delete("/:id", async (req, res) => {
  const champId = Number(req.params.id);
  if (!champId) return res.status(400).json({ error: "Invalid championship id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 0) Participantes (FK directa a championships)
    await client.query(
      `DELETE FROM kart_champ.championship_participants WHERE championship_id = $1`,
      [champId]
    );

    // 1) Resultados de carreras
    await client.query(
      `
      DELETE FROM kart_champ.race_results
      WHERE championship_race_id IN (
        SELECT id FROM kart_champ.championship_races WHERE championship_id = $1
      )
      `,
      [champId]
    );

    // 2) Carreras del campeonato
    await client.query(
      `DELETE FROM kart_champ.championship_races WHERE championship_id = $1`,
      [champId]
    );

    // 3) Campeonato
    await client.query(
      `DELETE FROM kart_champ.championships WHERE id = $1`,
      [champId]
    );

    await client.query("COMMIT");
    return res.sendStatus(204);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DELETE championship cascade error:", e);
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
router.post("/:id/races", async (req, res) => {

  const champId = Number(req.params.id);
  const { name } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ⚠️ aquí deberías llamar a RaceControl real
    const fakeRacecontrolSessionId = Date.now();

    const q = await client.query(`
      INSERT INTO kart_champ.championship_races
      (championship_id, racecontrol_session_id, name, status)
      VALUES ($1,$2,$3,'CREATED')
      RETURNING *
    `,[champId,fakeRacecontrolSessionId,name||"Race"]);

    await client.query("COMMIT");

    res.json(q.rows[0]);

  } catch(e){
    await client.query("ROLLBACK");
    res.status(500).json({error:e.message});
  } finally {
    client.release();
  }

});
module.exports = router;
