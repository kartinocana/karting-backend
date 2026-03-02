const express = require("express");
const router = express.Router();
const pool = require("../../db");

// =====================================================
// GET TIMING POINTS (PÚBLICO)
// GET /api/timing-points
// =====================================================
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        tp.id,
        tp.name,
        tp.type,
        tp.sector_number,
        tp.loop_code,
        tp.protocol,
        tp.decoder_ip,
        tp.decoder_port,
        tp.username,
        tp.password
      FROM timing_points tp
      ORDER BY tp.id
    `);

    res.json(rows);
  } catch (err) {
    console.error("❌ GET timing-points error:", err);
    res.status(500).json({
      error: "Error cargando timing points"
    });
  }
});

module.exports = router;


