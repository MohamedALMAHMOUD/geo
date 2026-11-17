// Signature cryptographique des tickets QR (Ed25519).
// Le serveur signe chaque ticket avec sa CLE PRIVEE.
// - Validation EN LIGNE : le serveur verifie la signature + marque le ticket "utilise" (anti-rejeu).
// - Validation HORS-LIGNE : l'appareil du chauffeur verifie la signature avec la CLE PUBLIQUE
//   (telechargee une fois via GET /api/ticket/pubkey), sans reseau ni acces a la cle privee.
//   => un faux QR est impossible a fabriquer (il faudrait la cle privee).
//
// Le payload contient { id, u, l, p, iat, exp, n } : identifiant, utilisateur, ligne,
// prix, emission, expiration, nonce. La signature couvre tout => illisible a falsifier.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_FILE = path.join(__dirname, "..", "data", "keys.json");
let keyPair = null;

function loadOrCreate() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            const j = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
            keyPair = {
                publicKey: crypto.createPublicKey({ key: Buffer.from(j.pub, "base64"), format: "der", type: "spki" }),
                privateKey: crypto.createPrivateKey({ key: Buffer.from(j.priv, "base64"), format: "der", type: "pkcs8" })
            };
            return;
        }
    } catch (e) { /* on regenere */ }

    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    keyPair = { publicKey, privateKey };
    try {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, JSON.stringify({
            pub: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
            priv: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
        }));
    } catch (e) { /* ecriture best-effort */ }
}
loadOrCreate();

// Retourne une chaine "BUSQR2.<payload>.<signature>" (a mettre dans le QR).
function sign(obj) {
    const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
    const sig = crypto.sign(null, Buffer.from(payload), keyPair.privateKey).toString("base64url");
    return "BUSQR2." + payload + "." + sig;
}

// Verifie la signature et retourne l'objet payload, ou null si invalide.
function verify(token) {
    try {
        const parts = String(token).trim().split(".");
        if (parts.length !== 3 || parts[0] !== "BUSQR2") return null;
        const ok = crypto.verify(null, Buffer.from(parts[1]), keyPair.publicKey, Buffer.from(parts[2], "base64url"));
        if (!ok) return null;
        return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch (e) { return null; }
}

function publicKeyBase64() {
    return keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

module.exports = { sign, verify, publicKeyBase64 };
