const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/", async (req, res) => {
    try {
        const overdue = await pool.query(`
            SELECT * FROM karts WHERE maintenance_status='overdue'
        `);

        const warn = await pool.query(`
            SELECT * FROM karts WHERE maintenance_status='warn'
        `);

        res.json({
            overdue: overdue.rows,
            warn: warn.rows
        });

    } catch (err) {
        console.error("❌ Error GET alerts:", err);
        res.status(500).json({ error: "Failed alerts query" });
    }
});

module.exports = router;
