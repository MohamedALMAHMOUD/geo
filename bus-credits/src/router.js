// Calcul d'itineraire avec correspondances (comme un planificateur TAN).
// Graphe : noeuds = (ligne, index d'arret). Aretes :
//   - trajet entre arrets consecutifs d'une meme ligne (les deux sens)
//   - correspondance entre deux lignes qui partagent le meme arret (meme "key")
// Dijkstra d'une source virtuelle (marche depuis l'origine) vers un puits (marche vers la destination).

const { data } = require("./db");
const { distanceMeters } = require("./geo");

const WALK_KMH = 5;
const RIDE_KMH = 20;
const TRANSFER_MIN = 4;         // attente + marche a la correspondance
const STOP_TRANSFER_RADIUS = 120; // m : deux arrets consideres "le meme point"

const walkMin = (m) => (m / 1000) / WALK_KMH * 60;
const rideMin = (m) => (m / 1000) / RIDE_KMH * 60;

function buildNodes() {
    // node index <-> {lineIdx, stopIdx}
    const nodes = [];
    const idOf = new Map();
    data.lines.forEach((line, li) => {
        (line.stops || []).forEach((_, si) => {
            idOf.set(li + ":" + si, nodes.length);
            nodes.push({ lineIdx: li, stopIdx: si });
        });
    });
    return { nodes, idOf };
}

function planJourney(from, to, opts = {}) {
    const maxWalk = opts.maxWalkMeters || 1000;
    const lines = data.lines.filter((l) => l.stops && l.stops.length >= 2);
    if (!lines.length) return [];

    const { nodes, idOf } = buildNodes();
    const N = nodes.length;
    const SOURCE = N, SINK = N + 1;
    const adj = Array.from({ length: N + 2 }, () => []);
    const add = (a, b, w, kind) => adj[a].push({ to: b, w, kind });

    // aretes de trajet (les deux sens) + source/puits
    data.lines.forEach((line, li) => {
        const stops = line.stops || [];
        for (let si = 0; si < stops.length; si++) {
            const id = idOf.get(li + ":" + si);
            if (si + 1 < stops.length) {
                const d = distanceMeters(stops[si], stops[si + 1]);
                add(id, idOf.get(li + ":" + (si + 1)), rideMin(d), "ride");
                add(idOf.get(li + ":" + (si + 1)), id, rideMin(d), "ride");
            }
            const dFrom = distanceMeters(from, stops[si]);
            if (dFrom <= maxWalk) add(SOURCE, id, walkMin(dFrom), "walk");
            const dTo = distanceMeters(to, stops[si]);
            if (dTo <= maxWalk) add(id, SINK, walkMin(dTo), "walk");
        }
    });

    // aretes de correspondance : arrets de lignes differentes au meme point
    for (let a = 0; a < N; a++) {
        for (let b = a + 1; b < N; b++) {
            const na = nodes[a], nb = nodes[b];
            if (na.lineIdx === nb.lineIdx) continue;
            const sa = data.lines[na.lineIdx].stops[na.stopIdx];
            const sb = data.lines[nb.lineIdx].stops[nb.stopIdx];
            if (distanceMeters(sa, sb) <= STOP_TRANSFER_RADIUS) {
                add(a, b, TRANSFER_MIN, "transfer");
                add(b, a, TRANSFER_MIN, "transfer");
            }
        }
    }

    // Dijkstra
    const dist = new Array(N + 2).fill(Infinity);
    const prev = new Array(N + 2).fill(null);
    const done = new Array(N + 2).fill(false);
    dist[SOURCE] = 0;
    for (let it = 0; it < N + 2; it++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u === -1) break;
        done[u] = true;
        if (u === SINK) break;
        for (const e of adj[u]) {
            if (dist[u] + e.w < dist[e.to]) { dist[e.to] = dist[u] + e.w; prev[e.to] = { from: u, kind: e.kind, w: e.w }; }
        }
    }
    if (dist[SINK] === Infinity) return [];

    // reconstruire le chemin de noeuds
    const path = [];
    let cur = SINK;
    while (cur !== null && prev[cur]) { path.push({ node: cur, via: prev[cur] }); cur = prev[cur].from; }
    path.push({ node: SOURCE, via: null });
    path.reverse();

    // transformer en segments (marche / bus / correspondance)
    const legs = [];
    let i = 0;
    // premiere marche (source -> premier arret)
    // path[0]=SOURCE, path[1]=premier arret via walk
    for (let k = 1; k < path.length; k++) {
        const step = path[k];
        const via = step.via;
        if (step.node === SINK) {
            const prevNode = nodes[path[k - 1].node];
            const s = data.lines[prevNode.lineIdx].stops[prevNode.stopIdx];
            legs.push({ type: "walk", toName: "الوجهة", fromName: s.name, min: Math.round(via.w), meters: Math.round(via.w / walkMin(1000) * 1000) });
            continue;
        }
        if (via.kind === "walk" && path[k - 1].node === SOURCE) {
            const nd = nodes[step.node];
            const s = data.lines[nd.lineIdx].stops[nd.stopIdx];
            legs.push({ type: "walk", fromName: "موقعك", toName: s.name, min: Math.round(via.w), meters: Math.round(via.w / walkMin(1000) * 1000) });
        } else if (via.kind === "ride") {
            const nd = nodes[step.node];
            const line = data.lines[nd.lineIdx];
            const last = legs[legs.length - 1];
            if (last && last.type === "bus" && last.lineIdx === nd.lineIdx) {
                last.alightIdx = nd.stopIdx;
            } else {
                const prevNode = nodes[path[k - 1].node];
                legs.push({ type: "bus", lineIdx: nd.lineIdx, lineId: line.id, lineName: line.name, boardIdx: prevNode.stopIdx, alightIdx: nd.stopIdx });
            }
        } else if (via.kind === "transfer") {
            const nd = nodes[step.node];
            const s = data.lines[nd.lineIdx].stops[nd.stopIdx];
            legs.push({ type: "transfer", atName: s.name, min: TRANSFER_MIN });
        }
    }

    // finaliser les legs bus (noms, sens, duree, nb d'arrets)
    let totalMin = 0, transfers = 0;
    const outLegs = legs.map((l) => {
        if (l.type === "bus") {
            const line = data.lines[l.lineIdx];
            const lo = Math.min(l.boardIdx, l.alightIdx), hi = Math.max(l.boardIdx, l.alightIdx);
            let m = 0;
            for (let j = lo; j < hi; j++) m += distanceMeters(line.stops[j], line.stops[j + 1]);
            const min = Math.max(1, Math.round(rideMin(m)));
            totalMin += min;
            return {
                type: "bus", lineId: line.id, lineName: line.name,
                direction: l.boardIdx < l.alightIdx ? "ذهاب" : "إياب",
                boardName: line.stops[l.boardIdx].name, alightName: line.stops[l.alightIdx].name,
                stops: hi - lo, min, priceCredits: line.priceCredits
            };
        }
        if (l.type === "transfer") { transfers++; totalMin += l.min; return { type: "transfer", atName: l.atName, min: l.min }; }
        totalMin += l.min; return l; // walk
    });

    const busLegs = outLegs.filter((l) => l.type === "bus");
    const fareCredits = busLegs.reduce((s, l) => s + l.priceCredits, 0);

    return [{
        totalMin: Math.round(totalMin),
        transfers,
        fareCredits,
        legs: outLegs,
        lineNames: busLegs.map((l) => l.lineName)
    }];
}

module.exports = { planJourney };
