// Test d'interoperabilite serveur <-> app Android (sans telephone).
//
//   node tools/interop-vectors.js make <vectors.json>   : achete de vrais jetons sur le serveur
//        (cles "telephone" generees ici, cles privees exportees pour le test Kotlin)
//   node tools/interop-vectors.js sync <records.json>   : renvoie au serveur les validations
//        produites par la logique Kotlin, pour verifier que le serveur les accepte.
//
// Necessite le serveur demarre (npm start) et les donnees de demo (npm run seed).

const crypto = require("crypto");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:4000/api";

async function api(path, { method = "GET", body, token } = {}) {
    const r = await fetch(BASE + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(path + " -> " + (d.error || r.status));
    return d;
}

async function make(out) {
    const { token } = await api("/auth/login", { method: "POST", body: { phone: "0940000002", pin: "1234" } });
    const rc = await api("/recharge", { method: "POST", token, body: { amountCredits: 175 } });
    await api(`/recharge/${rc.recharge.id}/simulate-transfer`, { method: "POST", token });
    await api(`/recharge/${rc.recharge.id}/verify`, { method: "POST", token });

    const keys = Array.from({ length: 5 }, () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }));
    const publicKeys = keys.map((k) => k.publicKey.export({ format: "der", type: "spki" }).toString("base64"));
    const bought = await api("/tokens/buy", { method: "POST", token, body: { publicKeys } });
    const serverKey = (await api("/tokens/pubkey")).publicKey;
    const { machines } = await api("/sim/machines");

    const vectors = {
        serverKey,
        machineId: machines[0].id,
        otherMachineId: machines[1].id,
        tokens: bought.tokens.map((t, i) => ({
            tid: t.tid, token: t.token,
            pkcs8: keys[i].privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
        }))
    };
    fs.writeFileSync(out, JSON.stringify(vectors, null, 2));
    console.log(`vecteurs : ${vectors.tokens.length} jetons reels, machine ${vectors.machineId}`);
}

async function sync(file) {
    const { machineId, records } = JSON.parse(fs.readFileSync(file, "utf8"));
    const { results } = await api("/machine/sync", { method: "POST", body: { machineId, records } });
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(`synchro : ${count("accepted")} acceptees, ${count("duplicate")} doublons, ${count("rejected")} rejetees`);
    results.filter((r) => r.status === "rejected").forEach((r) => console.log("  rejet :", r.reason));
    if (count("rejected") > 0 || count("accepted") !== records.length) process.exit(1);

    // Re-envoi : le serveur ne doit pas compter deux fois
    const again = await api("/machine/sync", { method: "POST", body: { machineId, records } });
    const dup = again.results.filter((r) => r.status === "duplicate").length;
    console.log(`re-envoi du meme journal : ${dup}/${records.length} reconnus comme doublons (pas payes 2 fois)`);
    if (dup !== records.length) process.exit(1);
}

const [cmd, file] = process.argv.slice(2);
(cmd === "make" ? make(file) : cmd === "sync" ? sync(file) : Promise.reject(new Error("usage: make|sync <fichier>")))
    .catch((e) => { console.error("ERREUR :", e.message); process.exit(1); });
