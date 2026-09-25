// Serveur Express : sert la page et envoie la position par e-mail via Resend.
// Node 18+ requis (fetch natif).

require("dotenv").config();

const express = require("express");
const path = require("path");

const {
    RESEND_API_KEY,
    MAIL_FROM,   // ex. "Position <position@ton-domaine.fr>" (domaine vérifié sur Resend)
    MAIL_TO,     // destinataire
    PORT = 3000
} = process.env;

if (!RESEND_API_KEY || !MAIL_FROM || !MAIL_TO) {
    console.error("Variables manquantes : RESEND_API_KEY, MAIL_FROM, MAIL_TO (voir .env.example)");
    process.exit(1);
}

const app = express();
app.use(express.json({ limit: "2kb" }));
app.use(express.static(path.join(__dirname, "public")));

function isValidCoord(value, min, max) {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

app.post("/api/send-location", async (req, res) => {

    const { latitude, longitude, accuracy } = req.body || {};

    if (!isValidCoord(latitude, -90, 90) || !isValidCoord(longitude, -180, 180)) {
        return res.status(400).json({ error: "Coordonnées invalides." });
    }

    const precision = isValidCoord(accuracy, 0, 1e7) ? Math.round(accuracy) : "inconnue";
    const maps = `https://www.google.com/maps?q=${latitude},${longitude}`;
    const date = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

    const html = `
        <h2>Nouvelle position partagée</h2>
        <p><strong>Date :</strong> ${date}</p>
        <p><strong>Latitude :</strong> ${latitude}<br>
           <strong>Longitude :</strong> ${longitude}<br>
           <strong>Précision :</strong> ${precision} m</p>
        <p><a href="${maps}">Voir sur Google Maps</a></p>
    `;

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: MAIL_FROM,
                to: [MAIL_TO],
                subject: `Position partagée — ${date}`,
                html,
                text: `Position : ${latitude}, ${longitude} (précision ${precision} m)\n${maps}\n${date}`
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("Erreur Resend :", data);
            return res.status(502).json({ error: "Échec de l'envoi de l'e-mail." });
        }

        res.json({ ok: true, id: data.id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur." });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré : http://localhost:${PORT}`);
});
