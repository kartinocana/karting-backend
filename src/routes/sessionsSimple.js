const express = require("express");
const router = express.Router();
const pool = require("../../db");

// LISTAR
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM session_simple ORDER BY id DESC"
  );
  res.json(rows);
});

// CREAR
router.post("/", async (req, res) => {
  const { name, className, driver_ids } = req.body;

  const { rows } = await pool.query(
    `
    INSERT INTO session_simple (name, class, driver_ids)
    VALUES ($1,$2,$3)
    RETURNING *
    `,
    [name, className, driver_ids]
  );

  res.status(201).json(rows[0]);
});

// BORRAR
router.delete("/:id", async (req, res) => {
  await pool.query(
    "DELETE FROM session_simple WHERE id=$1",
    [req.params.id]
  );
  res.json({ success: true });
});
router.post("/", async (req, res) => {
  const { name, className } = req.body;

  const { rows } = await pool.query(
    `
    INSERT INTO sessions_simple (name, class)
    VALUES ($1,$2)
    RETURNING *
    `,
    [name, className]
  );

  res.status(201).json(rows[0]);
});

module.exports = router;
