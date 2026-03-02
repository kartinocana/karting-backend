const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * Ver clasificación por campeonato y categoría (opcional)
 * GET /api/championships/:championshipId/standings?category=pro
 */
router.get(
  "/championships/:championshipId/standings",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);
    const category = req.query.category || null;

    try {
      const result = await pool.query(
        `
        SELECT
          s.participant_id,
          d.name,
          p.category,
          s.total_points
        FROM kart_champ.championship_standings s

        JOIN kart_champ.championship_participants p
          ON p.championship_id = s.championship_id
         AND p.racecontrol_driver_id = s.participant_id

        JOIN public.drivers d
          ON d.id = s.participant_id

        WHERE s.championship_id = $1
        AND ($2::text IS NULL OR p.category = $2)

        ORDER BY s.total_points DESC;
        `,
        [championshipId, category]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("STANDINGS ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
