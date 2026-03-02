const express = require("express");
const router = express.Router();
const pool = require("../../db");
const { assertChampionshipEditable } =
  require("../utils/championshipGuard");

/**
 * Crear penalización de campeonato
 */
router.post(
  "/championships/:championshipId/penalties",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);
    const { racecontrol_driver_id, race_id, points, reason } = req.body;

    await assertChampionshipEditable(championshipId);

    if (!racecontrol_driver_id || points == null) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    try {
      await pool.query(
        `
        INSERT INTO kart_champ.championship_penalties
          (championship_id,
           racecontrol_driver_id,
           race_id,
           points,
           reason)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          championshipId,
          racecontrol_driver_id,
          race_id ?? null,
          points,
          reason ?? null,
        ]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("PENALTIES POST ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET historial de penalizaciones — VERSIÓN A PRUEBA DE ESQUEMA
 * (solo usa columnas que casi seguro existen)
 */
router.get(
  "/championships/:championshipId/penalties/history",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);

    try {
      const result = await pool.query(
        `
        SELECT
          p.id,
          p.racecontrol_driver_id,
          p.points,
          p.reason,
          p.created_at,
          p.revoked,
          p.revoked_at,
          p.revoked_reason
        FROM kart_champ.championship_penalties p
        WHERE p.championship_id = $1
        ORDER BY p.created_at DESC
        `,
        [championshipId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("PENALTIES HISTORY ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Revocar penalización
 */
router.post(
  "/championships/:championshipId/penalties/:penaltyId/revoke",
  async (req, res) => {
    const penaltyId = Number(req.params.penaltyId);
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Motivo obligatorio" });
    }

    try {
      await pool.query(
        `
        UPDATE kart_champ.championship_penalties
        SET
          revoked = true,
          revoked_at = now(),
          revoked_reason = $1
        WHERE id = $2
        `,
        [reason, penaltyId]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error("PENALTY REVOKE ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;

