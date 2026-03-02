const express = require("express");
const router = express.Router();
const multer = require("multer");
const nodemailer = require("nodemailer");

const upload = multer({ storage: multer.memoryStorage() });

/*
POST /api/session-report
recibe:
- email
- session_id
- file (PDF)
*/
router.post("/session-report", upload.single("file"), async (req, res) => {
  try {

    const { email, session_id } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email requerido" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "PDF requerido" });
    }

    // ⚠️ CONFIGURA TU SMTP REAL
    const transporter = nodemailer.createTransport({

      host: "smtp.gmail.com",
      port: 465,
      secure: true,

      auth: {
        user: "TU_CORREO@gmail.com",
        pass: "PASSWORD_APP_GMAIL"
      }

    });

    await transporter.sendMail({

      from: `"Karting Timing" <TU_CORREO@gmail.com>`,

      to: email,

      subject: `Informe sesión #${session_id}`,

      text:
`Hola,

Adjunto tienes el informe de tu sesión.

Gracias por correr con nosotros.`,

      attachments: [{
        filename: `informe_sesion_${session_id}.pdf`,
        content: req.file.buffer
      }]

    });

    res.json({ ok: true });

  } catch (err) {

    console.error("EMAIL ERROR:", err);
    res.status(500).json({ error: err.message });

  }
});

module.exports = router;