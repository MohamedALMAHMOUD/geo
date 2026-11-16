// Simulateur de deplacement des bus le long des lignes.
// Chaque bus avance sur le "path" de sa ligne, fait des aller-retours,
// et met a jour sa position (lat/lng) + sa position precedente.
//
// En production, ces positions viendraient du GPS reel des bus
// (POST /api/bus/:id/position par le chauffeur), et ce fichier serait inutile.

const { data } = require("./db");
const { pointOnPath } = require("./geo");

const STEP = 0.12;        // avance par tick (en unites de waypoints)
const INTERVAL_MS = 2000; // frequence de mise a jour

function tick() {
    for (const bus of data.buses) {
        if (bus.manual) continue; // position fournie par un vrai chauffeur
        const line = data.lines.find((l) => l.id === bus.lineId);
        if (!line || !line.path || line.path.length < 2) continue;

        // memoriser la position precedente (pour savoir si le bus "se rapproche")
        bus.prevLat = bus.lat;
        bus.prevLng = bus.lng;

        const max = line.path.length - 1;
        bus.t += STEP * bus.dir;

        // rebond aux extremites -> changement de sens (ذهاب <-> إياب)
        if (bus.t >= max) { bus.t = max; bus.dir = -1; }
        else if (bus.t <= 0) { bus.t = 0; bus.dir = 1; }

        const p = pointOnPath(line.path, bus.t);
        bus.lat = p.lat;
        bus.lng = p.lng;
        bus.direction = bus.dir > 0 ? "ذهاب" : "إياب";
        bus.updatedAt = new Date().toISOString();
    }
}

let timer = null;
function start() {
    if (timer) return;
    // positionner chaque bus au depart s'il n'a pas de coordonnees
    for (const bus of data.buses) {
        const line = data.lines.find((l) => l.id === bus.lineId);
        if (line && line.path && (bus.lat == null)) {
            const p = pointOnPath(line.path, bus.t || 0);
            if (p) { bus.lat = p.lat; bus.lng = p.lng; bus.prevLat = p.lat; bus.prevLng = p.lng; }
        }
        bus.direction = (bus.dir || 1) > 0 ? "ذهاب" : "إياب";
    }
    timer = setInterval(tick, INTERVAL_MS);
    console.log(`Simulateur de bus demarre (${data.buses.length} bus).`);
}

module.exports = { start };
