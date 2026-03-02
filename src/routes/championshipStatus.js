const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.post(
  "/championships/:championshipId/status",
  async (req, res) => {
    const championshipId = Number(req.params.championshipId);
    const { status } = req.body;

    if (!["draft", "active", "official"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    await pool.query(
      `
      UPDATE kart_champ.championships
      SET status = $1
      WHERE id = $2
      `,
      [status, championshipId]
    );

    res.json({ ok: true, status });
  }
);

module.exports = router;
