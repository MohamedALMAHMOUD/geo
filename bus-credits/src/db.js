// Stockage JSON simple (prototype). Facile a remplacer par PostgreSQL plus tard.
// Toutes les collections sont des tableaux d'objets avec un champ "id".

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY = {
    users: [],        // { id, phone, name, role: 'client'|'transporteur', pinHash, salt, createdAt }
    lines: [],        // { id, name, ownerId, priceCredits, chamcashAccount, path:[[lat,lng],...] }
    buses: [],        // { id, lineId, label, t, dir, lat, lng, prevLat, prevLng, manual, updatedAt }
    favorites: [],    // { userId, lineId }
    tickets: [],      // { id, userId, lineId, status, priceCredits, createdAt, exp, usedAt, validatedBy }
    wallets: [],      // { userId, balanceCredits }
    recharges: [],    // { id, clientId, lineId, amountCredits, reference, status, chamcashRef, createdAt, confirmedAt }
    trips: [],        // { id, clientId, lineId, priceCredits, createdAt }
    sessions: []      // { token, userId, role, exp }
};

let data = structuredClone(EMPTY);

function load() {
    try {
        if (fs.existsSync(DB_FILE)) {
            data = Object.assign(structuredClone(EMPTY), JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
        } else {
            save();
        }
    } catch (err) {
        console.error("Erreur de lecture de la base, reinitialisation :", err.message);
        data = structuredClone(EMPTY);
        save();
    }
}

function save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let counter = Date.now();
function newId(prefix) {
    counter += 1;
    return `${prefix}_${counter.toString(36)}`;
}

load();

module.exports = { data, save, newId, DB_FILE };
