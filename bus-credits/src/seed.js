// Jeu de donnees de demonstration : 1 transporteur, 2 lignes, 1 client.
// Lancer avec : npm run seed
const { data, save, newId } = require("./db");
const { hashPin } = require("./auth");

// Repart de zero
data.users.length = 0;
data.lines.length = 0;
data.wallets.length = 0;
data.recharges.length = 0;
data.trips.length = 0;
data.sessions.length = 0;

function mkUser(phone, name, role, pin) {
    const { hash, salt } = hashPin(pin);
    const u = { id: newId("usr"), phone, name, role, pinHash: hash, salt, createdAt: new Date().toISOString() };
    data.users.push(u);
    data.wallets.push({ userId: u.id, balanceCredits: 0 });
    return u;
}

const transporteur = mkUser("0930000001", "Transports Al-Cham", "transporteur", "1234");
const client = mkUser("0940000002", "Ahmad Client", "client", "1234");

data.lines.push(
    { id: newId("line"), name: "Ligne 1 : Centre-ville <-> Universite", ownerId: transporteur.id, priceCredits: 35, chamcashAccount: "CHAM-700100" },
    { id: newId("line"), name: "Ligne 2 : Gare <-> Marche", ownerId: transporteur.id, priceCredits: 35, chamcashAccount: "CHAM-700200" }
);

save();
console.log("Donnees de demo creees :");
console.log("  Transporteur -> tel 0930000001 / PIN 1234");
console.log("  Client       -> tel 0940000002 / PIN 1234");
console.log("  2 lignes a 35 credits (= 3500 L.S. anciennes) le trajet.");
