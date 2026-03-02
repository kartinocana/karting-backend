const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * POST /api/championships/:championshipId/races
 * Crear carrera/día dentro del campeonato
 */
router.post("/championships/:championshipId/races", async (req, res) => {
  const championshipId = Number(req.params.championshipId);
  const { racecontrol_session_id, race_date } = req.body;

  if (!racecontrol_session_id) {
    return res.status(400).json({ error: "Falta racecontrol_session_id" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO kart_champ.championship_races
        (championship_id, racecontrol_session_id, race_date)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [championshipId, Number(racecontrol_session_id), race_date ?? null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("RACES POST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/championships/:championshipId/races
 * Listar carreras del campeonato
 */
router.get("/championships/:championshipId/races", async (req, res) => {
  const championshipId = Number(req.params.championshipId);

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        championship_id,
        racecontrol_session_id,
        race_date,
        created_at
      FROM kart_champ.championship_races
      WHERE championship_id = $1
      ORDER BY race_date NULLS LAST, id DESC
      `,
      [championshipId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("RACES GET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
