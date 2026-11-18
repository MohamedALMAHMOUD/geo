// "Tampon officiel" des jetons hors-ligne (ECDSA P-256).
//
// Principe (voir sim.html) :
//  - A l'achat, le telephone cree 1 cle secrete par trajet dans sa puce de securite
//    (le "coffre-fort"). Il envoie seulement la cle PUBLIQUE au serveur.
//  - Le serveur signe un jeton {tid, cle publique, prix} avec SA cle privee : c'est le tampon officiel.
//  - Dans le bus, la machine (hors-ligne) verifie le tampon avec la cle publique du serveur,
//    puis verifie que le telephone a signe SON code aleatoire avec la cle du jeton.
//  - La puce detruit la cle apres 1 signature => jeton "brule", impossible a reutiliser.
//
// P-256 est utilise car il est supporte partout (Android Keystore, WebCrypto, Node).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_FILE = path.join(__dirname, "..", "data", "token-keys.json");
let pub = null;
let priv = null;

(function loadOrCreate() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            const j = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
            pub = crypto.createPublicKey({ key: Buffer.from(j.pub, "base64"), format: "der", type: "spki" });
            priv = crypto.createPrivateKey({ key: Buffer.from(j.priv, "base64"), format: "der", type: "pkcs8" });
            return;
        }
    } catch (e) { /* on regenere */ }
    const kp = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    pub = kp.publicKey;
    priv = kp.privateKey;
    try {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, JSON.stringify({
            pub: pub.export({ format: "der", type: "spki" }).toString("base64"),
            priv: priv.export({ format: "der", type: "pkcs8" }).toString("base64")
        }));
    } catch (e) { /* best-effort */ }
})();

// Signature au format brut (r||s), identique a WebCrypto et facile a verifier sur la machine.
const SIG = { dsaEncoding: "ieee-p1363" };

// Retourne "<payload base64url>.<signature base64url>"
function signToken(obj) {
    const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
    const sig = crypto.sign("sha256", Buffer.from(payload), { key: priv, ...SIG }).toString("base64url");
    return payload + "." + sig;
}

// Verifie le tampon officiel et retourne le contenu du jeton, ou null.
function verifyToken(token) {
    try {
        const [payload, sig] = String(token).split(".");
        if (!payload || !sig) return null;
        const ok = crypto.verify("sha256", Buffer.from(payload), { key: pub, ...SIG }, Buffer.from(sig, "base64url"));
        if (!ok) return null;
        return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch (e) { return null; }
}

// Verifie la signature faite par le telephone (cle du jeton) sur un message.
function verifyPassenger(pubSpkiB64, message, sigB64url) {
    try {
        const k = crypto.createPublicKey({ key: Buffer.from(pubSpkiB64, "base64"), format: "der", type: "spki" });
        return crypto.verify("sha256", Buffer.from(message), { key: k, ...SIG }, Buffer.from(sigB64url, "base64url"));
    } catch (e) { return false; }
}

// Verifie qu'une cle publique envoyee par le telephone est bien une cle P-256.
function isValidP256(pubSpkiB64) {
    try {
        const k = crypto.createPublicKey({ key: Buffer.from(pubSpkiB64, "base64"), format: "der", type: "spki" });
        return k.asymmetricKeyType === "ec" && k.asymmetricKeyDetails && k.asymmetricKeyDetails.namedCurve === "prime256v1";
    } catch (e) { return false; }
}

function publicKeyB64() {
    return pub.export({ format: "der", type: "spki" }).toString("base64");
}

// Message signe par le telephone : lie le jeton au code aleatoire ET a la machine.
function validationMessage(tid, challenge, machineId) {
    return `${tid}|${challenge}|${machineId}`;
}

module.exports = { signToken, verifyToken, verifyPassenger, isValidP256, publicKeyB64, validationMessage };
