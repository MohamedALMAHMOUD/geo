// Jeu de donnees de demonstration : 1 transporteur, 2 lignes (avec traces), 3 bus, 1 client.
// Lancer avec : npm run seed
const { data, save, newId } = require("./db");
const { hashPin } = require("./auth");

data.users.length = 0;
data.lines.length = 0;
data.buses.length = 0;
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

const transporteur = mkUser("0930000001", "شركة الشام للنقل", "transporteur", "1234");
const client = mkUser("0940000002", "أحمد الزبون", "client", "1234");

// Traces (autour de Damas) : [lat, lng]
const line1 = {
    id: newId("line"),
    name: "الخط ١: وسط المدينة ↔ الجامعة",
    ownerId: transporteur.id,
    priceCredits: 35,
    chamcashAccount: "CHAM-700100",
    path: [
        [33.5020, 36.2600],
        [33.5080, 36.2700],
        [33.5138, 36.2765],
        [33.5200, 36.2850],
        [33.5260, 36.2950]
    ]
};
const line2 = {
    id: newId("line"),
    name: "الخط ٢: الكراج ↔ السوق",
    ownerId: transporteur.id,
    priceCredits: 35,
    chamcashAccount: "CHAM-700200",
    path: [
        [33.4950, 36.3000],
        [33.5010, 36.2950],
        [33.5070, 36.2880],
        [33.5130, 36.2820]
    ]
};
data.lines.push(line1, line2);

function mkBus(lineId, label, t, dir) {
    data.buses.push({
        id: newId("bus"), lineId, label, t, dir,
        lat: null, lng: null, prevLat: null, prevLng: null,
        manual: false, direction: dir > 0 ? "ذهاب" : "إياب", updatedAt: new Date().toISOString()
    });
}
// Deux bus sur la ligne 1 (un dans chaque sens), un bus sur la ligne 2
mkBus(line1.id, "باص ١-أ", 1.0, 1);   // ذهاب
mkBus(line1.id, "باص ١-ب", 3.0, -1);  // إياب
mkBus(line2.id, "باص ٢-أ", 1.0, 1);   // ذهاب

save();
console.log("تم إنشاء بيانات العرض:");
console.log("  الناقل : هاتف 0930000001 / الرمز 1234");
console.log("  الزبون : هاتف 0940000002 / الرمز 1234");
console.log("  خطان + 3 باصات (محاكاة حركة حيّة).");
