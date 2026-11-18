// Serveur principal : API + fichiers statiques des deux dashboards.
const express = require("express");
const path = require("path");
const routes = require("./src/routes");
const simulator = require("./src/simulator");

const app = express();
const PORT = process.env.PORT || 4000;

// 512kb : l'achat d'un carnet envoie les preuves d'attestation Android de chaque cle.
app.use(express.json({ limit: "512kb" }));
app.use("/api", routes);
app.use(express.static(path.join(__dirname, "public")));

// Petit health-check
app.get("/healthz", (req, res) => res.json({ ok: true }));

simulator.start(); // deplace les bus de demo (a desactiver en production avec vrais GPS)

app.listen(PORT, () => {
    console.log(`Bus-Credits demarre : http://localhost:${PORT}`);
    console.log(`  - Client        : http://localhost:${PORT}/`);
    console.log(`  - Transporteur  : http://localhost:${PORT}/transporteur.html`);
});
