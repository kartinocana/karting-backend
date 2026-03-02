const pool = require("../lib/db");

async function processPacket(tp, raw) {
  try {
    // ejemplo RAW esperado desde CronoNet:
    // "76698;22884;2025-12-04T18:00:00Z"
    // transponder ; ms_from_start ; timestamp

    const parts = raw.split(";");
    if (parts.length < 3) {
      console.log("⚠ RAW ignorado, formato incorrecto:", raw);
      return;
    }

    const transponder = parts[0];
    const elapsedMs = Number(parts[1]);
    const timestamp = parts[2];

    // guardamos RAW SIEMPRE
    await pool.query(
      `INSERT INTO timing_log_raw (transponder, timing_point_id, raw_text, timestamp)
       VALUES ($1,$2,$3,$4)`,
      [transponder, tp.id, raw, timestamp]
    );

    // obtener piloto + sesión activa
    const q = await pool.query(
      `SELECT d.id AS driver_id, s.id AS session_id, s.state
       FROM drivers d
       LEFT JOIN sessions s ON s.active_driver = d.id
       WHERE d.transponder = $1
       ORDER BY s.id DESC
       LIMIT 1`,
      [transponder]
    );

    if (q.rowCount === 0) {
      console.log(`⚠ Transponder ${transponder} sin piloto asignado.`);
      return;
    }

    const driver_id = q.rows[0].driver_id;
    const session_id = q.rows[0].session_id;

    if (!session_id) {
      console.log(`⚠ No hay sesión activa para piloto ${driver_id}`);
      return;
    }

    console.log(`🏎 Procesando paso: TP=${tp.name}, piloto=${driver_id}`);

    // cargar última vuelta
    const lastLapQuery = await pool.query(
      `SELECT * FROM laps
       WHERE session_id=$1 AND driver_id=$2
       ORDER BY lap_number DESC
       LIMIT 1`,
      [session_id, driver_id]
    );

    let lapNumber = 1;

    if (tp.type === "finish") {
      if (lastLapQuery.rowCount > 0) {
        lapNumber = lastLapQuery.rows[0].lap_number + 1;
      }

      // registrar vuelta
      await pool.query(
        `INSERT INTO laps (session_id, driver_id, lap_number, lap_time_ms, timestamp)
         VALUES ($1,$2,$3,$4,$5)`,
        [session_id, driver_id, lapNumber, elapsedMs, timestamp]
      );

      console.log(`🏁 VUELTA ${lapNumber} → ${elapsedMs}ms`);

    } else if (tp.type === "sector") {
      await pool.query(
        `INSERT INTO sectors (session_id, driver_id, sector_number, sector_time_ms, timestamp)
         VALUES ($1,$2,$3,$4,$5)`,
        [session_id, driver_id, tp.sector_number, elapsedMs, timestamp]
      );

      console.log(`⏱ SECTOR ${tp.sector_number} → ${elapsedMs}ms`);

    } else if (tp.type === "pit_in") {
      await pool.query(
        `INSERT INTO pit_events (session_id, driver_id, event_type, timestamp)
         VALUES ($1,$2,'pit_in',$3)`,
        [session_id, driver_id, timestamp]
      );

      console.log("🟡 PIT IN");

    } else if (tp.type === "pit_out") {
      await pool.query(
        `INSERT INTO pit_events (session_id, driver_id, event_type, timestamp)
         VALUES ($1,$2,'pit_out',$3)`,
        [session_id, driver_id, timestamp]
      );

      console.log("🟢 PIT OUT");
    }

  } catch (err) {
    console.error("❌ Error procesando RAW:", err);
  }
}

module.exports = processPacket;
