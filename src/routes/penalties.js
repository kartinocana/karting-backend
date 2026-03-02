// backend/src/routes/penalties.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");

// =========================================
// GET penalties (con filtros seguros)
// =========================================
router.get("/", async (req, res) => {
  try {
    const sessionId = Number(req.query.session_id || 0);

    // si no se pasa session_id, devolver vacío en vez de generar error
    if (!sessionId) return res.json([]);

    const sql = `
      SELECT p.id, p.session_id, p.participant_id,
             p.reason, p.time_penalty, p.created_at,
             sp.driver_id, d.name AS driver_name,
             sp.kart_id, k.number AS kart_number
      FROM penalties p
      LEFT JOIN session_participants sp ON sp.id = p.participant_id
      LEFT JOIN drivers d ON d.id = sp.driver_id
      LEFT JOIN karts k ON k.id = sp.kart_id
      WHERE p.session_id = $1
      ORDER BY p.id DESC
    `;

    const result = await pool.query(sql, [sessionId]);
    res.json(result.rows);

  } catch (err) {
    console.error("❌ GET /penalties:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// =========================================
// ADD penalty
// =========================================
router.post("/", async (req, res) => {
  try {
    const { session_id, participant_id, reason, time_penalty } = req.body;

    const sql = `
      INSERT INTO penalties (session_id, participant_id, reason, time_penalty)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `;

    const r = await pool.query(sql, [
      session_id,
      participant_id,
      reason || "",
      time_penalty || 0
    ]);

    res.json(r.rows[0]);

  } catch (err) {
    console.error("❌ POST /penalties:", err);
    res.status(500).json({ error: "Insert error" });
  }
});

// =========================================
// DELETE penalty
// =========================================
router.delete("/:id", async (req, res) => {
  try {
    const penaltyId = Number(req.params.id);

    const r = await pool.query("DELETE FROM penalties WHERE id=$1", [penaltyId]);

    if (!r.rowCount) {
      return res.status(404).json({ error: "Penalty not found" });
    }

    res.json({ status: "deleted" });

  } catch (err) {
    console.error("❌ DELETE /penalties:", err);
    res.status(500).json({ error: "Delete error" });
  }
});

module.exports = router;
