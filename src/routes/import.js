const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../../db");

// POST /api/race-control/session/:id/import-from-session
router.post("/import-from-session", async (req, res) => {
  const sessionId = Number(req.params.id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "session id inválido" });
  }

  try {
    const { rowCount } = await pool.query(
      `
      INSERT INTO race_entries (
        session_id,
        driver_id,
        kart_id,
        transponder,
        grid_position
      )
      SELECT
        sp.session_id,
        sp.driver_id,
        sp.kart_id,
        sp.transponder,
        sp.grid_position
      FROM session_participants sp
      WHERE sp.session_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM race_entries re
          WHERE re.session_id = sp.session_id
        )
      `,
      [sessionId]
    );

    res.json({ ok: true, imported: rowCount });
  } catch (err) {
    console.error("❌ Import race entries error:", err);
    res.status(500).json({ error: "Error importando parrilla" });
  }
});

module.exports = router;
