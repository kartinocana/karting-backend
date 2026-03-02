const express = require("express");
const router = express.Router({ mergeParams:true });
const pool = require("../../db");

router.post("/", async (req,res)=>{
  try{

    const champId = Number(req.params.champId);
    const roundId = Number(req.params.roundId);

    // 1️⃣ crear sesión
    const {rows:[session]} = await pool.query(`
      INSERT INTO sessions(name,type,status)
      VALUES ('Carrera','race','pending')
      RETURNING *
    `);

    // 2️⃣ cargar inscritos del campeonato
    const {rows:drivers} = await pool.query(`
      SELECT racecontrol_driver_id AS driver_id,
             kart_id,
             weight,
             category
      FROM kart_champ.championship_participants
      WHERE championship_id=$1
      AND active IS DISTINCT FROM false
    `,[champId]);

    // 3️⃣ insertarlos en session_participants
    for(const d of drivers){

      await pool.query(`
        INSERT INTO session_participants
        (session_id,driver_id,kart_id,weight,category)
        VALUES($1,$2,$3,$4,$5)
      `,[session.id,d.driver_id,d.kart_id,d.weight,d.category]);

    }

    res.json({
      ok:true,
      sessionId:session.id,
      synced:drivers.length
    });

  }catch(err){
    console.error("SYNC ERROR",err);
    res.status(500).json({error:"sync error"});
  }
});

module.exports = router;