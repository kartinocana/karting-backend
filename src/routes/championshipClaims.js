const express = require("express");
const router = express.Router();
const pool = require("../../db");

// Crear reclamación
router.post(
  "/championships/:championshipId/claims",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);
    const {
      race_id,
      claimant_participant_id,
      accused_participant_id,
      description
    } = req.body;

    if (!claimant_participant_id || !description) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    await pool.query(
      `
      INSERT INTO kart_champ.championship_claims
        (championship_id, race_id, claimant_participant_id,
         accused_participant_id, description)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        championshipId,
        race_id ?? null,
        claimant_participant_id,
        accused_participant_id ?? null,
        description
      ]
    );

    res.json({ ok: true });
  }
);

// Listar reclamaciones
router.get(
  "/championships/:championshipId/claims",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);

    const result = await pool.query(
      `
      SELECT *
      FROM kart_champ.championship_claims
      WHERE championship_id = $1
      ORDER BY created_at DESC
      `,
      [championshipId]
    );

    res.json(result.rows);
  }
);

// Resolver reclamación
router.post(
  "/championships/:championshipId/claims/:claimId/resolve",
  async (req, res) => {
    const claimId = Number(req.params.claimId);
    const { status, resolution, resolved_by } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    await pool.query(
      `
      UPDATE kart_champ.championship_claims
      SET
        status = $1,
        resolution = $2,
        resolved_by = $3,
        resolved_at = now()
      WHERE id = $4
      `,
      [status, resolution ?? null, resolved_by ?? null, claimId]
    );

    res.json({ ok: true });
  }
);

module.exports = router;
