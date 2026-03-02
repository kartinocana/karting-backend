const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * Recalcular clasificación de campeonato
 * POST /api/championships/:championshipId/recalculate
 */
router.post(
  "/championships/:championshipId/recalculate",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);

    if (!Number.isInteger(championshipId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    try {
      // 1️⃣ Borrar standings previos
      await pool.query(
        `
        DELETE FROM kart_champ.championship_standings
        WHERE championship_id = $1
        `,
        [championshipId]
      );

      // 2️⃣ Recalcular SOLO con race_results (SIN penalizaciones por ahora)
      await pool.query(
        `
        INSERT INTO kart_champ.championship_standings
          (championship_id, participant_id, total_points)

        SELECT
          $1 AS championship_id,
          r.racecontrol_driver_id AS participant_id,
          SUM(r.points) AS total_points

        FROM kart_champ.race_results r

        JOIN kart_champ.championship_races cr
          ON cr.id = r.championship_race_id
         AND cr.championship_id = $1

        GROUP BY r.racecontrol_driver_id
        ORDER BY total_points DESC
        `,
        [championshipId]
      );

      res.json({ ok: true });

    } catch (err) {
      console.error("RECALC ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;


