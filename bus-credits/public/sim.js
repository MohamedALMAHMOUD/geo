// =============================================================================
//  Simulateur : jetons hors-ligne (coffre-fort du téléphone + machine sans internet)
// =============================================================================
//  - TELEPHONE : chaque jeton = une clé secrète créée dans le "coffre-fort"
//    (ici WebCrypto, clé NON exportable, stockée dans IndexedDB ; sur un vrai
//    Android ce sera la puce de sécurité avec une clé à usage unique).
//  - MACHINE : connaît seulement la clé publique du serveur ("tampon officiel").
//    Elle envoie un code aléatoire, le téléphone le signe avec la clé du jeton,
//    la machine vérifie, SANS AUCUN APPEL INTERNET.
// =============================================================================

const API = "/api";
const $ = (id) => document.getElementById(id);
const subtle = window.crypto && window.crypto.subtle;
const ALG = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };
const enc = (s) => new TextEncoder().encode(s);

// ---------- encodage ----------
function bufToB64(buf) {
    let s = "";
    for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
    return btoa(s);
}
const bufToB64u = (buf) => bufToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b64uToBuf(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
}
function randomHex(n) {
    const b = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
const short = (tid) => String(tid || "").slice(-6);
const now = () => new Date().toLocaleTimeString("fr-FR");

// ---------- stockage local (try/catch : peut être bloqué) ----------
function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

// ---------- internet (simulé) + compteur d'appels ----------
const net = { phone: true, machine: true };
let netCalls = 0;
async function call(side, path, { method = "GET", body, token } = {}) {
    if (!net[side]) throw new Error("Pas d'internet sur " + (side === "phone" ? "le téléphone" : "la machine") + ".");
    netCalls++;
    const res = await fetch(API + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Erreur serveur");
    return d;
}

function msg(el, text, ok = true) { el.innerHTML = text; el.className = "msg show " + (ok ? "ok" : "err"); }
function renderNet() {
    for (const side of ["phone", "machine"]) {
        const el = $(side === "phone" ? "phoneNet" : "machineNet");
        el.className = "net " + (net[side] ? "on" : "off");
        el.textContent = net[side] ? "📶 Internet : ON" : "🚫 Internet : OFF";
    }
}
$("phoneNet").onclick = () => { net.phone = !net.phone; renderNet(); };
$("machineNet").onclick = () => { net.machine = !net.machine; renderNet(); };

// =============================================================================
//  LE COFFRE-FORT (IndexedDB : on y range des CryptoKey non exportables)
// =============================================================================
function idb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open("coffre-fort", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("keys");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function vault(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
        const tx = db.transaction("keys", mode);
        const out = fn(tx.objectStore("keys"));
        tx.oncomplete = () => res(out && out.result);
        tx.onerror = () => rej(tx.error);
    });
}
const vaultPut = (tid, key) => vault("readwrite", (s) => s.put(key, tid));
const vaultGet = (tid) => vault("readonly", (s) => s.get(tid));
const vaultDel = (tid) => vault("readwrite", (s) => s.delete(tid));
const vaultClear = () => vault("readwrite", (s) => s.clear());

// =============================================================================
//  TELEPHONE
// =============================================================================
const phone = load("sim_phone", { auth: null, tokens: [] }); // tokens: [{tid, token, burned}]
const savePhone = () => store("sim_phone", phone);

function renderPhone() {
    $("phoneLogin").classList.toggle("hidden", !!phone.auth);
    $("phoneApp").classList.toggle("hidden", !phone.auth);
    const active = phone.tokens.filter((t) => !t.burned).length;
    $("vaultCount").textContent = active;
    $("vault").innerHTML = phone.tokens.length
        ? phone.tokens.map((t) => `<div class="jeton ${t.burned ? "burned" : ""}" title="${t.tid}">${t.burned ? "✕" : "🔑"}</div>`).join("")
        : "<span class='muted' style='font-size:13px'>Vide. Achetez un carnet.</span>";
}

async function refreshWallet() {
    if (!phone.auth || !net.phone) return;
    try { const w = await call("phone", "/wallet", { token: phone.auth }); $("wallet").textContent = w.balanceCredits; }
    catch (e) { if (/authentifi/i.test(e.message)) { phone.auth = null; savePhone(); renderPhone(); } }
}

$("loginBtn").onclick = async () => {
    try {
        const d = await call("phone", "/auth/login", { method: "POST", body: { phone: "0940000002", pin: "1234" } });
        phone.auth = d.token; savePhone(); renderPhone(); refreshWallet();
    } catch (e) { msg($("phoneMsg"), e.message, false); }
};

$("rechargeBtn").onclick = async () => {
    try {
        const t = phone.auth;
        const rc = await call("phone", "/recharge", { method: "POST", token: t, body: { amountCredits: 350 } });
        await call("phone", `/recharge/${rc.recharge.id}/simulate-transfer`, { method: "POST", token: t });
        const v = await call("phone", `/recharge/${rc.recharge.id}/verify`, { method: "POST", token: t });
        $("wallet").textContent = v.balanceCredits;
        msg($("phoneMsg"), "✅ 350 crédits reçus sur votre portefeuille (paiement ShamCash simulé).");
    } catch (e) { msg($("phoneMsg"), e.message, false); }
};

// Achat d'un carnet : le téléphone crée 10 clés dans son coffre-fort,
// n'envoie que les clés PUBLIQUES, et reçoit 10 jetons tamponnés par le serveur.
$("buyBtn").onclick = async () => {
    try {
        if (!net.phone) throw new Error("Pas d'internet sur le téléphone : l'achat se fait en ligne.");
        const pairs = [];
        for (let i = 0; i < 10; i++) {
            pairs.push(await subtle.generateKey(ALG, false /* clé secrète NON exportable */, ["sign", "verify"]));
        }
        const publicKeys = [];
        for (const p of pairs) publicKeys.push(bufToB64(await subtle.exportKey("spki", p.publicKey)));
        const d = await call("phone", "/tokens/buy", { method: "POST", token: phone.auth, body: { publicKeys } });
        for (let i = 0; i < d.tokens.length; i++) {
            await vaultPut(d.tokens[i].tid, pairs[i].privateKey);
            phone.tokens.push({ tid: d.tokens[i].tid, token: d.tokens[i].token, burned: false });
        }
        savePhone(); renderPhone();
        $("wallet").textContent = d.balanceCredits;
        msg($("phoneMsg"), "✅ 10 jetons rangés dans le coffre-fort du téléphone.");
    } catch (e) { msg($("phoneMsg"), e.message, false); }
};

$("resetPhone").onclick = async () => {
    await vaultClear(); phone.tokens = []; savePhone(); renderPhone();
    msg($("phoneMsg"), "Téléphone vidé.");
};

// Réponse du téléphone au contact NFC : signe le code de la machine avec le prochain jeton,
// puis le coffre-fort DÉTRUIT la clé (sur Android : fait par la puce elle-même).
async function phoneRespond(challenge, machineId) {
    const t = phone.tokens.find((x) => !x.burned);
    if (!t) throw new Error("Plus de jetons dans le téléphone.");
    const key = await vaultGet(t.tid);
    if (!key) throw new Error("Clé introuvable dans le coffre-fort.");
    const sig = await subtle.sign(SIGN, key, enc(`${t.tid}|${challenge}|${machineId}`));
    await vaultDel(t.tid);          // 🔥 la clé est détruite
    t.burned = true; savePhone(); renderPhone();
    return { token: t.token, challenge, sig: bufToB64u(sig) };
}

// =============================================================================
//  MACHINE
// =============================================================================
let machines = load("sim_machines", []);
let machine = null; // { id, label, challenge, seen:[], log:[], synced }
let lastExchange = null;

function machineState(id) { return load("sim_machine_" + id, { seen: [], log: [], synced: 0 }); }
function saveMachine() { store("sim_machine_" + machine.id, { seen: machine.seen, log: machine.log, synced: machine.synced }); }
function newChallenge() { machine.challenge = randomHex(8); $("challengeTxt").textContent = "Code aléatoire envoyé par NFC : " + machine.challenge; }

function selectMachine(id) {
    const m = machines.find((x) => x.id === id) || machines[0];
    if (!m) return;
    machine = { ...m, ...machineState(m.id) };
    newChallenge(); renderMachine();
    setScreen(null, "Approchez votre téléphone");
}

async function loadMachines() {
    try {
        const d = await call("machine", "/sim/machines");
        machines = d.machines; store("sim_machines", machines);
    } catch (e) {
        if (!machines.length) msg($("machineMsg"), "Impossible de charger la liste des bus : " + e.message, false);
    }
    $("machineSel").innerHTML = machines.map((m) => `<option value="${m.id}">${m.label} — ${m.lineName}</option>`).join("");
    if (machines.length) selectMachine(machines[0].id);
}
$("machineSel").onchange = (e) => selectMachine(e.target.value);

function renderKeyState() {
    const has = !!load("sim_server_key", null);
    $("keyState").innerHTML = has
        ? "✅ Tampon officiel chargé : la machine peut valider <b>sans internet</b>."
        : "⚠️ Tampon officiel pas encore chargé (à faire une fois, au dépôt, avec internet).";
}

$("loadKeyBtn").onclick = async () => {
    try {
        const d = await call("machine", "/tokens/pubkey");
        store("sim_server_key", d.publicKey); renderKeyState();
        msg($("machineMsg"), "✅ Tampon officiel enregistré dans la machine.");
    } catch (e) { msg($("machineMsg"), e.message, false); }
};

function renderMachine() {
    if (!machine) return;
    const rows = machine.log.slice().reverse().slice(0, 12).map((r, i) => {
        const idx = machine.log.length - 1 - i;
        return `<div>🟢 ${r.time} — jeton …${short(r.tid)} ${idx < machine.synced ? "<span class='muted'>(synchronisé)</span>" : "<span class='muted'>(en attente de synchro)</span>"}</div>`;
    });
    $("mLog").innerHTML = rows.length ? "<b>Journal de la machine</b>" + rows.join("") : "";
}

function setScreen(ok, title, sub = "") {
    const s = $("screen");
    s.className = "screen" + (ok === true ? " ok" : ok === false ? " ko" : "");
    s.innerHTML = `${title}<small>${sub}</small><small id="challengeTxt">${machine ? "Code aléatoire envoyé par NFC : " + machine.challenge : ""}</small>`;
}

async function serverKey() {
    const b64 = load("sim_server_key", null);
    if (!b64) return null;
    return subtle.importKey("spki", b64uToBuf(b64), ALG, false, ["verify"]);
}

// Vérification 100 % locale (aucun appel réseau).
async function machineVerify(m, resp) {
    const sk = await serverKey();
    if (!sk) return { ok: false, reason: "Machine non initialisée : chargez le tampon officiel." };
    const parts = String(resp.token || "").split(".");
    if (parts.length !== 2) return { ok: false, reason: "Jeton illisible." };
    let okServer = false;
    try { okServer = await subtle.verify(SIGN, sk, b64uToBuf(parts[1]), enc(parts[0])); } catch { /* faux */ }
    if (!okServer) return { ok: false, reason: "Tampon officiel invalide : c'est un faux jeton." };
    const p = JSON.parse(new TextDecoder().decode(b64uToBuf(parts[0])));
    if (resp.challenge !== m.challenge) return { ok: false, reason: "Ce n'est pas le code que je viens d'envoyer : échange copié ou rejoué." };
    let okPhone = false;
    try {
        const pk = await subtle.importKey("spki", b64uToBuf(p.pub), ALG, false, ["verify"]);
        okPhone = await subtle.verify(SIGN, pk, b64uToBuf(resp.sig), enc(`${p.tid}|${m.challenge}|${m.id}`));
    } catch { /* invalide */ }
    if (!okPhone) return { ok: false, reason: "Signature du téléphone invalide pour ce bus et ce code." };
    if (m.seen.includes(p.tid)) return { ok: false, reason: "Jeton déjà validé sur cette machine." };
    return { ok: true, p };
}

$("syncBtn").onclick = async () => {
    try {
        const pending = machine.log.slice(machine.synced);
        if (!pending.length) { msg($("machineMsg"), "Rien à synchroniser."); return; }
        const d = await call("machine", "/machine/sync", {
            method: "POST",
            body: { machineId: machine.id, records: pending.map((r) => ({ token: r.token, challenge: r.challenge, sig: r.sig, at: r.at })) }
        });
        const acc = d.results.filter((r) => r.status === "accepted").length;
        machine.synced = machine.log.length; saveMachine(); renderMachine();
        msg($("machineMsg"), `✅ ${acc} trajet(s) envoyé(s) au serveur et re-vérifié(s). La société sera payée : voir <a class="link" href="transporteur.html">Espace transporteur</a> → المستحقات.`);
    } catch (e) { msg($("machineMsg"), e.message, false); }
};

// =============================================================================
//  CONTACT NFC
// =============================================================================
$("tapBtn").onclick = async () => {
    if (!machine) return;
    if (!phone.auth) { setScreen(false, "❌ Téléphone non configuré", "Connectez-vous d'abord dans le téléphone."); return; }
    $("tapBtn").disabled = true;
    const before = netCalls;
    try {
        // 1) machine -> téléphone : code aléatoire + identifiant de la machine
        // 2) téléphone -> machine : jeton + signature (la clé brûle)
        const resp = await phoneRespond(machine.challenge, machine.id);
        // 3) la machine vérifie toute seule
        const r = await machineVerify(machine, resp);
        if (r.ok) {
            machine.seen.push(r.p.tid);
            machine.log.push({ tid: r.p.tid, token: resp.token, challenge: resp.challenge, sig: resp.sig, at: new Date().toISOString(), time: now() });
            lastExchange = { ...resp, machineId: machine.id };
            saveMachine(); newChallenge(); renderMachine();
            const left = phone.tokens.filter((t) => !t.burned).length;
            setScreen(true, "✅ Bon voyage !", `Jeton …${short(r.p.tid)} accepté · il reste ${left} jeton(s)`);
        } else {
            setScreen(false, "❌ Refusé", r.reason);
        }
    } catch (e) {
        setScreen(false, "❌ Refusé", e.message);
    } finally {
        $("tapBtn").disabled = false;
        const used = netCalls - before;
        $("proof").innerHTML = `Appels internet pendant cette validation : <b>${used}</b> · téléphone ${net.phone ? "en ligne" : "<b>hors-ligne</b>"} · machine ${net.machine ? "en ligne" : "<b>hors-ligne</b>"}`;
    }
};

// =============================================================================
//  LABO DE FRAUDE
// =============================================================================
function fraudLog(ok, title, detail) {
    const line = `<div><b class="${ok ? "ko-t" : "ok-t"}">${ok ? "⚠️ ACCEPTÉ" : "🛡️ BLOQUÉ"}</b> — ${title}<br><span class="muted">${detail}</span></div>`;
    $("fraudLog").innerHTML = line + $("fraudLog").innerHTML;
}

const frauds = {
    async replaySame() {
        if (!lastExchange) return fraudLog(false, "Rejouer sur la même machine", "Faites d'abord une validation réussie.");
        const a = await machineVerify(machine, lastExchange);
        fraudLog(a.ok, "Rejouer l'échange tel quel", a.ok ? "?" : a.reason);
        const b = await machineVerify(machine, { ...lastExchange, challenge: machine.challenge });
        fraudLog(b.ok, "Rejouer en recopiant le nouveau code de la machine", b.ok ? "?" : b.reason);
    },
    async replayOther() {
        if (!lastExchange) return fraudLog(false, "Envoyer à un complice", "Faites d'abord une validation réussie.");
        const other = machines.find((m) => m.id !== lastExchange.machineId);
        if (!other) return fraudLog(false, "Envoyer à un complice", "Il faut au moins 2 bus.");
        const m2 = { ...other, ...machineState(other.id), challenge: randomHex(8) };
        const r = await machineVerify(m2, { ...lastExchange, challenge: m2.challenge });
        fraudLog(r.ok, `Le complice présente l'échange dans « ${other.label} »`, r.ok ? "?" : r.reason);
    },
    async reuseBurned() {
        const t = phone.tokens.find((x) => x.burned);
        if (!t) return fraudLog(false, "Réutiliser un jeton brûlé", "Aucun jeton brûlé pour l'instant : faites une validation.");
        const key = await vaultGet(t.tid);
        fraudLog(!!key, `Signer à nouveau avec le jeton …${short(t.tid)}`, key ? "?" : "La clé n'existe plus : elle a été détruite au premier usage.");
    },
    async extractKey() {
        const t = phone.tokens.find((x) => !x.burned);
        if (!t) return fraudLog(false, "Sortir une clé", "Aucun jeton disponible : achetez un carnet.");
        const key = await vaultGet(t.tid);
        try {
            await subtle.exportKey("pkcs8", key);
            fraudLog(true, "Sortir la clé du coffre-fort", "La clé a pu être copiée.");
        } catch {
            fraudLog(false, `Sortir la clé du jeton …${short(t.tid)}`, "Le coffre-fort refuse : une clé secrète ne peut jamais en sortir.");
        }
    },
    async fakeToken() {
        const kp = await subtle.generateKey(ALG, true, ["sign", "verify"]);
        const pub = bufToB64(await subtle.exportKey("spki", kp.publicKey));
        const payload = bufToB64u(enc(JSON.stringify({ tid: "jt_faux", u: "pirate", pub, p: 35, iat: Date.now() })));
        const fakeServerSig = bufToB64u(crypto.getRandomValues(new Uint8Array(64)));
        const sig = await subtle.sign(SIGN, kp.privateKey, enc(`jt_faux|${machine.challenge}|${machine.id}`));
        const r = await machineVerify(machine, { token: payload + "." + fakeServerSig, challenge: machine.challenge, sig: bufToB64u(sig) });
        fraudLog(r.ok, "Présenter un jeton fabriqué maison", r.ok ? "?" : r.reason);
    }
};
document.querySelectorAll("[data-fraud]").forEach((b) => b.onclick = async () => {
    try { await frauds[b.dataset.fraud](); } catch (e) { fraudLog(false, "Erreur", e.message); }
});

// =============================================================================
//  DÉMARRAGE
// =============================================================================
(async function init() {
    if (!window.isSecureContext || !subtle || !window.indexedDB) {
        const el = $("insecure");
        el.style.display = "block"; el.className = "msg show err";
        el.textContent = "Ce simulateur a besoin d'une connexion sécurisée (HTTPS ou localhost) pour utiliser le coffre-fort du navigateur.";
        return;
    }
    renderNet(); renderPhone(); renderKeyState();
    await loadMachines();
    refreshWallet();
})();
