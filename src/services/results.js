
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { pool } = require('../lib/db');

async function getSessionResults(sessionId) {
  const client = await pool.connect();
  try {
    const sessionRes = await client.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionRes.rows.length === 0) throw new Error('Sesión no encontrada');
    const session = sessionRes.rows[0];

    const participantsRes = await client.query(
      `SELECT sp.*,
              d.name as driver_name,
              d.nickname,
              k.number as kart_number
       FROM session_participants sp
       JOIN drivers d ON d.id = sp.driver_id
       JOIN karts k ON k.id = sp.kart_id
       WHERE sp.session_id = $1
       ORDER BY (sp.total_time_ms + COALESCE(sp.penalty_time_ms,0)) ASC NULLS LAST,
                sp.best_lap_ms ASC NULLS LAST`,
      [sessionId]
    );
    return { session, participants: participantsRes.rows };
  } finally {
    client.release();
  }
}

function createSessionPdfBuffer(results) {
  return new Promise((resolve, reject) => {
    const { session, participants } = results;
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Resultados de sesión', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`ID Sesión: ${session.id}`);
    doc.text(`Nombre: ${session.name || ''}`);
    doc.text(`Tipo: ${session.type}`);
    doc.text(`Estado: ${session.status}`);
    if (session.start_time) doc.text(`Inicio: ${session.start_time}`);
    if (session.end_time) doc.text(`Fin: ${session.end_time}`);

    doc.moveDown();
    doc.fontSize(14).text('Clasificación', { underline: true });
    doc.moveDown(0.3);

    const headers = ['Pos', 'Piloto', 'Kart', 'Vueltas', 'Mejor vuelta', 'Total', 'Penalización'];
    const startX = doc.x;
    const colWidths = [30, 160, 50, 60, 80, 80, 80];

    doc.fontSize(10);
    headers.forEach((h, i) => {
      doc.text(h, startX + colWidths.slice(0, i).reduce((a,b)=>a+b,0), doc.y, { continued: i < headers.length-1 });
    });
    doc.moveDown(0.5);

    function formatMs(ms) {
      if (ms == null) return '-';
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const millis = ms % 1000;
      return `${minutes}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
    }

    participants.forEach((p, idx) => {
      const row = [
        String(idx+1),
        p.driver_name + (p.nickname ? ` (${p.nickname})` : ''),
        `#${p.kart_number}`,
        String(p.laps_completed || 0),
        formatMs(p.best_lap_ms),
        formatMs(p.total_time_ms),
        formatMs(p.penalty_time_ms)
      ];
      row.forEach((val, i) => {
        doc.text(val, startX + colWidths.slice(0, i).reduce((a,b)=>a+b,0), doc.y, { continued: i < row.length-1 });
      });
      doc.moveDown(0.3);
    });

    doc.end();
  });
}

function createTransporterFromEnv() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM
  } = process.env;

  if (!SMTP_HOST) throw new Error('SMTP_HOST no está configurado');

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_SECURE === 'true',
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

async function emailSessionResultsPdf(sessionId, to) {
  const transporter = createTransporterFromEnv();
  const results = await getSessionResults(sessionId);
  const pdfBuffer = await createSessionPdfBuffer(results);

  const from = process.env.SMTP_FROM || 'karting@local';

  await transporter.sendMail({
    from,
    to,
    subject: `Resultados sesión ${results.session.id} - ${results.session.name || ''}`,
    text: 'Adjuntamos los resultados de tu sesión de karting.',
    attachments: [
      {
        filename: `session-${results.session.id}-results.pdf`,
        content: pdfBuffer
      }
    ]
  });
}

module.exports = {
  getSessionResults,
  createSessionPdfBuffer,
  emailSessionResultsPdf
};
