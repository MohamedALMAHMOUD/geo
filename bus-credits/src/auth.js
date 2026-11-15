// Authentification simple (prototype) : telephone + code PIN.
// PIN hache avec scrypt. Jetons de session stockes en base.
// NOTE prod : remplacer par OTP SMS + JWT signes + HTTPS obligatoire.

const crypto = require("crypto");
const { data, save, newId } = require("./db");

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(String(pin), salt, 32).toString("hex");
    return { hash, salt };
}

function verifyPin(pin, salt, expectedHash) {
    const { hash } = hashPin(pin, salt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

function createSession(user) {
    const token = crypto.randomBytes(24).toString("hex");
    const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 jours
    data.sessions.push({ token, userId: user.id, role: user.role, exp });
    save();
    return token;
}

function getUserFromToken(token) {
    if (!token) return null;
    const s = data.sessions.find((x) => x.token === token);
    if (!s || s.exp < Date.now()) return null;
    return data.users.find((u) => u.id === s.userId) || null;
}

// Middleware : exige un utilisateur connecte (role optionnel).
function requireAuth(role) {
    return (req, res, next) => {
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const user = getUserFromToken(token);
        if (!user) return res.status(401).json({ error: "Non authentifie." });
        if (role && user.role !== role) return res.status(403).json({ error: "Acces refuse." });
        req.user = user;
        next();
    };
}

module.exports = { hashPin, verifyPin, createSession, getUserFromToken, requireAuth, newId };
