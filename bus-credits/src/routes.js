// API REST : auth, lignes, portefeuille, recharges, trajets, verification ChamCash.
const express = require("express");
const { data, save, newId } = require("./db");
const { hashPin, verifyPin, createSession, requireAuth } = require("./auth");
const chamcash = require("./chamcash");
const { distanceMeters } = require("./geo");
const { searchPlaces } = require("./places");
const { planJourney } = require("./router");

const BUS_SPEED_KMH = 20; // vitesse moyenne supposee pour estimer le temps d'arrivee

const router = express.Router();

// ---------- Helpers ----------
function walletOf(userId) {
    let w = data.wallets.find((x) => x.userId === userId);
    if (!w) {
        w = { userId, balanceCredits: 0 };
        data.wallets.push(w);
    }
    return w;
}

function publicUser(u) {
    return { id: u.id, phone: u.phone, name: u.name, role: u.role };
}

// =========================================================================
//  AUTH
// =========================================================================
router.post("/auth/register", (req, res) => {
    const { phone, name, pin, role } = req.body || {};
    if (!phone || !pin || !["client", "transporteur"].includes(role)) {
        return res.status(400).json({ error: "phone, pin et role (client|transporteur) requis." });
    }
    if (String(pin).length < 4) return res.status(400).json({ error: "Le PIN doit faire au moins 4 chiffres." });
    if (data.users.find((u) => u.phone === phone)) {
        return res.status(409).json({ error: "Ce numero est deja enregistre." });
    }
    const { hash, salt } = hashPin(pin);
    const user = {
        id: newId("usr"),
        phone: String(phone),
        name: name || phone,
        role,
        pinHash: hash,
        salt,
        createdAt: new Date().toISOString()
    };
    data.users.push(user);
    walletOf(user.id);
    save();
    const token = createSession(user);
    res.json({ token, user: publicUser(user) });
});

router.post("/auth/login", (req, res) => {
    const { phone, pin } = req.body || {};
    const user = data.users.find((u) => u.phone === String(phone));
    if (!user || !verifyPin(pin, user.salt, user.pinHash)) {
        return res.status(401).json({ error: "Numero ou PIN incorrect." });
    }
    const token = createSession(user);
    res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth(), (req, res) => {
    res.json({ user: publicUser(req.user) });
});

// =========================================================================
//  LIGNES DE BUS
// =========================================================================
// Liste publique des lignes (pour que le client choisisse)
router.get("/lines", (req, res) => {
    res.json({
        lines: data.lines.map((l) => {
            const owner = data.users.find((u) => u.id === l.ownerId);
            return {
                id: l.id,
                name: l.name,
                priceCredits: l.priceCredits,
                chamcashAccount: l.chamcashAccount,
                path: l.path || [],
                stops: l.stops || [],
                owner: owner ? owner.name : null
            };
        })
    });
});

// Un transporteur cree/configure une ligne
router.post("/lines", requireAuth("transporteur"), (req, res) => {
    const { name, priceCredits, chamcashAccount } = req.body || {};
    if (!name || !chamcashAccount) return res.status(400).json({ error: "name et chamcashAccount requis." });
    const line = {
        id: newId("line"),
        name,
        ownerId: req.user.id,
        priceCredits: Number(priceCredits) > 0 ? Number(priceCredits) : 35, // defaut: 35 L.S. nouvelles
        chamcashAccount: String(chamcashAccount)
    };
    data.lines.push(line);
    save();
    res.json({ line });
});

router.patch("/lines/:id", requireAuth("transporteur"), (req, res) => {
    const line = data.lines.find((l) => l.id === req.params.id && l.ownerId === req.user.id);
    if (!line) return res.status(404).json({ error: "Ligne introuvable." });
    const { name, priceCredits, chamcashAccount } = req.body || {};
    if (name) line.name = name;
    if (Number(priceCredits) > 0) line.priceCredits = Number(priceCredits);
    if (chamcashAccount) line.chamcashAccount = String(chamcashAccount);
    save();
    res.json({ line });
});

// =========================================================================
//  PORTEFEUILLE CLIENT
// =========================================================================
router.get("/wallet", requireAuth("client"), (req, res) => {
    const w = walletOf(req.user.id);
    res.json({ balanceCredits: w.balanceCredits });
});

router.get("/history", requireAuth("client"), (req, res) => {
    const recharges = data.recharges
        .filter((r) => r.clientId === req.user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const trips = data.trips
        .filter((t) => t.clientId === req.user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ recharges, trips });
});

// =========================================================================
//  RECHARGE (le parcours principal)
// =========================================================================
// 1) Le client demande une recharge -> on cree une demande "pending"
//    et on lui donne les instructions de paiement ChamCash.
router.post("/recharge", requireAuth("client"), (req, res) => {
    const { lineId, amountCredits } = req.body || {};
    const line = data.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: "Ligne introuvable." });
    const amount = Number(amountCredits);
    if (!(amount > 0)) return res.status(400).json({ error: "Montant invalide." });

    const reference = "REF-" + newId("r").split("_")[1].toUpperCase();
    const recharge = {
        id: newId("rc"),
        clientId: req.user.id,
        lineId: line.id,
        amountCredits: amount,
        reference,
        status: "pending",
        chamcashRef: null,
        createdAt: new Date().toISOString(),
        confirmedAt: null
    };
    data.recharges.push(recharge);
    save();

    res.json({
        recharge,
        instructions: {
            chamcashAccount: line.chamcashAccount,
            amountCredits: amount,
            reference,
            message: `Envoyez ${amount} L.S. (nouvelles) vers le compte ChamCash ${line.chamcashAccount} en indiquant la reference ${reference}.`
        }
    });
});

// 2) [DEMO/SIMULATION] Le client "envoie" l'argent via ChamCash.
//    En reel, cette etape se passe dans l'appli ChamCash, hors de notre systeme.
router.post("/recharge/:id/simulate-transfer", requireAuth("client"), (req, res) => {
    const rc = data.recharges.find((r) => r.id === req.params.id && r.clientId === req.user.id);
    if (!rc) return res.status(404).json({ error: "Demande introuvable." });
    const line = data.lines.find((l) => l.id === rc.lineId);
    chamcash.simulateIncomingTransfer({
        account: line.chamcashAccount,
        amountCredits: rc.amountCredits,
        reference: rc.reference
    });
    res.json({ ok: true, message: "Transfert simule injecte dans ChamCash. Vous pouvez maintenant verifier." });
});

// 3) Verification : on interroge ChamCash. Si le transfert est trouve ->
//    on confirme la recharge et on credite le portefeuille.
router.post("/recharge/:id/verify", requireAuth("client"), async (req, res) => {
    const rc = data.recharges.find((r) => r.id === req.params.id && r.clientId === req.user.id);
    if (!rc) return res.status(404).json({ error: "Demande introuvable." });
    if (rc.status === "confirmed") return res.json({ recharge: rc, alreadyConfirmed: true });

    const line = data.lines.find((l) => l.id === rc.lineId);
    const result = await chamcash.verifyTransfer({
        account: line.chamcashAccount,
        amountCredits: rc.amountCredits,
        reference: rc.reference
    });

    if (!result.found) {
        return res.status(402).json({ error: "Transfert non confirme par ChamCash.", detail: result.reason });
    }

    rc.status = "confirmed";
    rc.chamcashRef = result.chamcashRef;
    rc.confirmedAt = new Date().toISOString();
    const w = walletOf(rc.clientId);
    w.balanceCredits += rc.amountCredits;
    save();
    res.json({ recharge: rc, balanceCredits: w.balanceCredits });
});

// =========================================================================
//  TRAJET : debiter un trajet du portefeuille
// =========================================================================
router.post("/trip", requireAuth("client"), (req, res) => {
    const { lineId } = req.body || {};
    const line = data.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: "Ligne introuvable." });
    const w = walletOf(req.user.id);
    if (w.balanceCredits < line.priceCredits) {
        return res.status(402).json({ error: "Solde insuffisant.", balanceCredits: w.balanceCredits, priceCredits: line.priceCredits });
    }
    w.balanceCredits -= line.priceCredits;
    const trip = {
        id: newId("trip"),
        clientId: req.user.id,
        lineId: line.id,
        priceCredits: line.priceCredits,
        createdAt: new Date().toISOString()
    };
    data.trips.push(trip);
    save();
    res.json({ trip, balanceCredits: w.balanceCredits });
});

// =========================================================================
//  DASHBOARD TRANSPORTEUR
// =========================================================================
router.get("/transporteur/overview", requireAuth("transporteur"), (req, res) => {
    const myLines = data.lines.filter((l) => l.ownerId === req.user.id);
    const myLineIds = new Set(myLines.map((l) => l.id));

    const recharges = data.recharges
        .filter((r) => myLineIds.has(r.lineId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => {
            const client = data.users.find((u) => u.id === r.clientId);
            const line = myLines.find((l) => l.id === r.lineId);
            return { ...r, clientName: client ? client.name : "?", clientPhone: client ? client.phone : "?", lineName: line ? line.name : "?" };
        });

    const trips = data.trips.filter((t) => myLineIds.has(t.lineId));

    const confirmed = recharges.filter((r) => r.status === "confirmed");
    const revenueCredits = confirmed.reduce((s, r) => s + r.amountCredits, 0);
    const tripsRevenue = trips.reduce((s, t) => s + t.priceCredits, 0);

    // Ce que ChamCash "voit" arriver sur les comptes du transporteur (simule)
    const ledger = myLines.flatMap((l) => chamcash.listLedger(l.chamcashAccount));

    const buses = data.buses
        .filter((b) => myLineIds.has(b.lineId))
        .map((b) => {
            const line = myLines.find((l) => l.id === b.lineId);
            return { id: b.id, label: b.label, lineName: line ? line.name : "?", direction: b.direction, lat: b.lat, lng: b.lng, manual: b.manual, updatedAt: b.updatedAt };
        });

    res.json({
        lines: myLines,
        recharges,
        buses,
        stats: {
            pending: recharges.filter((r) => r.status === "pending").length,
            confirmed: confirmed.length,
            revenueCredits,
            tripsCount: trips.length,
            tripsRevenueCredits: tripsRevenue
        },
        ledger
    });
});

// Confirmation manuelle par le transporteur (filet de securite si la verif auto echoue).
router.post("/transporteur/recharge/:id/confirm", requireAuth("transporteur"), (req, res) => {
    const rc = data.recharges.find((r) => r.id === req.params.id);
    if (!rc) return res.status(404).json({ error: "Demande introuvable." });
    const line = data.lines.find((l) => l.id === rc.lineId);
    if (!line || line.ownerId !== req.user.id) return res.status(403).json({ error: "Cette ligne ne vous appartient pas." });
    if (rc.status === "confirmed") return res.json({ recharge: rc, alreadyConfirmed: true });

    rc.status = "confirmed";
    rc.chamcashRef = "MANUEL-" + new Date().toISOString();
    rc.confirmedAt = new Date().toISOString();
    const w = walletOf(rc.clientId);
    w.balanceCredits += rc.amountCredits;
    save();
    res.json({ recharge: rc });
});

router.post("/transporteur/recharge/:id/reject", requireAuth("transporteur"), (req, res) => {
    const rc = data.recharges.find((r) => r.id === req.params.id);
    if (!rc) return res.status(404).json({ error: "Demande introuvable." });
    const line = data.lines.find((l) => l.id === rc.lineId);
    if (!line || line.ownerId !== req.user.id) return res.status(403).json({ error: "Cette ligne ne vous appartient pas." });
    if (rc.status === "confirmed") return res.status(400).json({ error: "Deja confirmee." });
    rc.status = "rejected";
    save();
    res.json({ recharge: rc });
});

// =========================================================================
//  SUIVI DES BUS EN TEMPS REEL (les deux sens : ذهاب / إياب)
// =========================================================================
// Bus proches d'un point (position du client). Pour chaque bus : distance,
// temps estime, sens, et s'il "se rapproche" (il etait plus loin a l'instant d'avant).
router.get("/buses/near", (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm) || 5;
    const lineId = req.query.lineId || null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "lat et lng requis." });
    }
    const me = { lat, lng };

    const buses = data.buses
        .filter((bus) => bus.lat != null && (!lineId || bus.lineId === lineId))
        .map((bus) => {
            const line = data.lines.find((l) => l.id === bus.lineId);
            const d = distanceMeters(me, { lat: bus.lat, lng: bus.lng });
            const dPrev = (bus.prevLat != null)
                ? distanceMeters(me, { lat: bus.prevLat, lng: bus.prevLng })
                : d;
            const etaMin = Math.max(1, Math.round((d / 1000) / BUS_SPEED_KMH * 60));
            return {
                id: bus.id,
                label: bus.label,
                lineId: bus.lineId,
                lineName: line ? line.name : "?",
                direction: bus.direction || (bus.dir > 0 ? "ذهاب" : "إياب"),
                lat: bus.lat,
                lng: bus.lng,
                distanceMeters: Math.round(d),
                etaMin,
                approaching: dPrev > d + 2 // se rapproche (marge anti-bruit)
            };
        })
        .filter((b) => b.distanceMeters <= radiusKm * 1000)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

    res.json({ me, buses });
});

// Position envoyee par un vrai chauffeur (GPS du bus). Passe le bus en mode "manuel".
router.post("/bus/:id/position", requireAuth("transporteur"), (req, res) => {
    const bus = data.buses.find((b) => b.id === req.params.id);
    if (!bus) return res.status(404).json({ error: "Bus introuvable." });
    const line = data.lines.find((l) => l.id === bus.lineId);
    if (!line || line.ownerId !== req.user.id) return res.status(403).json({ error: "Ce bus ne vous appartient pas." });
    const { lat, lng, direction } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "lat/lng invalides." });
    bus.prevLat = bus.lat; bus.prevLng = bus.lng;
    bus.lat = lat; bus.lng = lng;
    if (direction) bus.direction = direction;
    bus.manual = true;
    bus.updatedAt = new Date().toISOString();
    res.json({ bus });
});

// =========================================================================
//  GEOCODAGE (عنوان -> إحداثيات) — version demo basee sur un gazetteer local
// =========================================================================
router.get("/geocode", (req, res) => {
    const q = req.query.q || "";
    // Si on recoit directement "lat,lng"
    const m = String(q).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
        return res.json({ results: [{ name: q, lat: Number(m[1]), lng: Number(m[2]) }] });
    }
    res.json({ results: searchPlaces(q) });
});

// =========================================================================
//  RECHERCHE D'ITINERAIRE : من عنوان إلى عنوان (خط مباشر)
// =========================================================================
// Pour chaque ligne : trouve l'arret le plus proche du depart (A) et de l'arrivee (B).
// Si les deux sont a distance de marche ET dans le bon ordre -> la ligne convient.
function nearestStop(stops, pt) {
    let best = null;
    stops.forEach((s, idx) => {
        const d = distanceMeters(pt, { lat: s.lat, lng: s.lng });
        if (!best || d < best.d) best = { idx, d, stop: s };
    });
    return best;
}

router.post("/search-routes", (req, res) => {
    const { from, to, maxWalkMeters } = req.body || {};
    if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) {
        return res.status(400).json({ error: "from et to (lat/lng) requis." });
    }
    const maxWalk = Number(maxWalkMeters) || 900;
    const favSet = new Set(); // rempli si utilisateur connecte
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const sess = data.sessions.find((x) => x.token === token && x.exp > Date.now());
    if (sess) data.favorites.filter((f) => f.userId === sess.userId).forEach((f) => favSet.add(f.lineId));

    const AVG_KMH = 20;
    const results = [];

    for (const line of data.lines) {
        if (!line.stops || line.stops.length < 2) continue;
        const a = nearestStop(line.stops, from);
        const b = nearestStop(line.stops, to);
        if (!a || !b || a.idx === b.idx) continue;
        if (a.d > maxWalk || b.d > maxWalk) continue;

        const direction = a.idx < b.idx ? "ذهاب" : "إياب";
        const lo = Math.min(a.idx, b.idx);
        const hi = Math.max(a.idx, b.idx);

        // distance a bord (le long des arrets entre A et B)
        let rideMeters = 0;
        for (let i = lo; i < hi; i++) {
            rideMeters += distanceMeters(
                { lat: line.stops[i].lat, lng: line.stops[i].lng },
                { lat: line.stops[i + 1].lat, lng: line.stops[i + 1].lng }
            );
        }
        const rideMin = Math.max(1, Math.round((rideMeters / 1000) / AVG_KMH * 60));

        results.push({
            lineId: line.id,
            lineName: line.name,
            priceCredits: line.priceCredits,
            direction,
            board: a.stop,                     // محطة الركوب
            alight: b.stop,                    // محطة النزول
            walkFromMeters: Math.round(a.d),
            walkToMeters: Math.round(b.d),
            rideMeters: Math.round(rideMeters),
            rideMin,
            stopsBetween: hi - lo,
            isFavorite: favSet.has(line.id)
        });
    }

    results.sort((x, y) => (x.walkFromMeters + x.walkToMeters) - (y.walkFromMeters + y.walkToMeters) || x.rideMin - y.rideMin);
    res.json({ from, to, count: results.length, routes: results });
});

// =========================================================================
//  PLANIFICATEUR D'ITINERAIRE AVEC CORRESPONDANCES (كالـ TAN)
// =========================================================================
router.post("/plan", (req, res) => {
    const { from, to } = req.body || {};
    if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) {
        return res.status(400).json({ error: "from et to (lat/lng) requis." });
    }
    const itineraries = planJourney(from, to, {});
    res.json({ from, to, itineraries });
});

// =========================================================================
//  TICKETS / QR (recharger un trajet et le montrer au conducteur / valideur)
// =========================================================================
// Le client genere un ticket -> un code QR a presenter. Le valideur (transporteur)
// le scanne -> le trajet est debite du solde du client.
router.post("/ticket/create", requireAuth("client"), (req, res) => {
    const { lineId } = req.body || {};
    const line = lineId ? data.lines.find((l) => l.id === lineId) : null;
    const price = line ? line.priceCredits : 35;
    const w = data.wallets.find((x) => x.userId === req.user.id) || { balanceCredits: 0 };
    if (w.balanceCredits < price) {
        return res.status(402).json({ error: "رصيد غير كافٍ لإنشاء التذكرة.", balanceCredits: w.balanceCredits, priceCredits: price });
    }
    const ticket = {
        id: newId("tk"),
        userId: req.user.id,
        lineId: line ? line.id : null,
        lineName: line ? line.name : "أي خط",
        priceCredits: price,
        status: "active",
        createdAt: new Date().toISOString(),
        exp: Date.now() + 15 * 60 * 1000, // صالحة 15 دقيقة
        usedAt: null,
        validatedBy: null
    };
    data.tickets.push(ticket);
    save();
    res.json({ ticket, qrPayload: "BUSQR:" + ticket.id });
});

// Etat d'un ticket (pour l'app client : savoir s'il a ete valide)
router.get("/ticket/:id", requireAuth("client"), (req, res) => {
    const t = data.tickets.find((x) => x.id === req.params.id && x.userId === req.user.id);
    if (!t) return res.status(404).json({ error: "التذكرة غير موجودة." });
    if (t.status === "active" && t.exp < Date.now()) { t.status = "expired"; save(); }
    res.json({ ticket: t });
});

// Validation par le conducteur / l'appareil (transporteur).
router.post("/ticket/validate", requireAuth("transporteur"), (req, res) => {
    let code = (req.body && req.body.code) || "";
    code = String(code).trim().replace(/^BUSQR:/i, "");
    const t = data.tickets.find((x) => x.id === code);
    if (!t) return res.status(404).json({ error: "تذكرة غير معروفة." });
    if (t.status === "used") return res.status(409).json({ error: "التذكرة مستخدمة مسبقًا.", usedAt: t.usedAt });
    if (t.status === "expired" || t.exp < Date.now()) { t.status = "expired"; save(); return res.status(410).json({ error: "التذكرة منتهية الصلاحية." }); }

    const w = data.wallets.find((x) => x.userId === t.userId);
    if (!w || w.balanceCredits < t.priceCredits) {
        return res.status(402).json({ error: "رصيد الراكب غير كافٍ." });
    }
    w.balanceCredits -= t.priceCredits;
    t.status = "used";
    t.usedAt = new Date().toISOString();
    t.validatedBy = req.user.id;
    // enregistrer comme trajet (pour les stats du transporteur)
    if (t.lineId) data.trips.push({ id: newId("trip"), clientId: t.userId, lineId: t.lineId, priceCredits: t.priceCredits, createdAt: t.usedAt });
    save();
    const rider = data.users.find((u) => u.id === t.userId);
    res.json({ ok: true, riderName: rider ? rider.name : "راكب", lineName: t.lineName, priceCredits: t.priceCredits, riderBalance: w.balanceCredits });
});

// =========================================================================
//  LIGNES FAVORITES (الخطوط المفضّلة)
// =========================================================================
router.get("/favorites", requireAuth("client"), (req, res) => {
    const ids = new Set(data.favorites.filter((f) => f.userId === req.user.id).map((f) => f.lineId));
    const lines = data.lines
        .filter((l) => ids.has(l.id))
        .map((l) => ({ id: l.id, name: l.name, priceCredits: l.priceCredits, stops: l.stops || [] }));
    res.json({ favorites: lines });
});

router.post("/favorites", requireAuth("client"), (req, res) => {
    const { lineId } = req.body || {};
    const line = data.lines.find((l) => l.id === lineId);
    if (!line) return res.status(404).json({ error: "الخط غير موجود." });
    if (!data.favorites.find((f) => f.userId === req.user.id && f.lineId === lineId)) {
        data.favorites.push({ userId: req.user.id, lineId });
        save();
    }
    res.json({ ok: true });
});

router.delete("/favorites/:lineId", requireAuth("client"), (req, res) => {
    const before = data.favorites.length;
    // mutation en place (data est la meme reference que l'objet exporte par db.js)
    for (let i = data.favorites.length - 1; i >= 0; i--) {
        const f = data.favorites[i];
        if (f.userId === req.user.id && f.lineId === req.params.lineId) data.favorites.splice(i, 1);
    }
    if (data.favorites.length !== before) save();
    res.json({ ok: true });
});

// Un transporteur ajoute un bus a l'une de ses lignes.
router.post("/buses", requireAuth("transporteur"), (req, res) => {
    const { lineId, label } = req.body || {};
    const line = data.lines.find((l) => l.id === lineId && l.ownerId === req.user.id);
    if (!line) return res.status(404).json({ error: "Ligne introuvable." });
    const bus = {
        id: newId("bus"), lineId, label: label || "باص",
        t: 0, dir: 1, lat: null, lng: null, prevLat: null, prevLng: null,
        manual: false, direction: "ذهاب", updatedAt: new Date().toISOString()
    };
    data.buses.push(bus);
    save();
    res.json({ bus });
});

module.exports = router;
