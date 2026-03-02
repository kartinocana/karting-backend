const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ==============================
// GET all teams
// ==============================
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM teams ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /teams error:", err);
    res.status(500).json({ error: "database_error" });
  }
});

// ==============================
// CREATE team
// ==============================
router.post("/", async (req, res) => {
  const { name, category, color, notes } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO teams (name, category, color, notes)
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [
        name,
        category || null,
        color || null,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /teams error:", err);
    res.status(500).json({ error: "database_error" });
  }
});

// ==============================
// DELETE team
// ==============================
router.delete("/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM teams WHERE id=$1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /teams error:", err);
    res.status(500).json({ error: "database_error" });
  }
});
// =====================================================
// GET /api/teams/:id
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        id,
        name
      FROM teams
      WHERE id = $1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Team no encontrado" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET /teams/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
