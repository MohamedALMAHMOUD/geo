// Jeu de donnees de demonstration : reseau de bus de Damas (4 lignes avec arrets + traces),
// 1 transporteur, 1 client, des bus en mouvement. Lancer avec : npm run seed
const { data, save, newId } = require("./db");
const { hashPin } = require("./auth");
const { LINES_DEF, stopsOf } = require("./places");

data.users.length = 0;
data.lines.length = 0;
data.buses.length = 0;
data.favorites.length = 0;
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
mkUser("0940000002", "أحمد الزبون", "client", "1234");

LINES_DEF.forEach((def) => {
    const stops = stopsOf(def);
    const line = {
        id: newId("line"),
        name: def.name,
        ownerId: transporteur.id,
        priceCredits: 35,
        chamcashAccount: def.account,
        stops,
        path: stops.map((s) => [s.lat, s.lng])
    };
    data.lines.push(line);

    for (let i = 0; i < def.buses; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        data.buses.push({
            id: newId("bus"),
            lineId: line.id,
            label: `${def.name.split(":")[0].trim()} • باص ${i + 1}`,
            t: i % 2 === 0 ? 1.0 : stops.length - 2,
            dir,
            lat: null, lng: null, prevLat: null, prevLng: null,
            manual: false, direction: dir > 0 ? "ذهاب" : "إياب", updatedAt: new Date().toISOString()
        });
    }
});

save();
console.log("تم إنشاء شبكة دمشق التجريبية:");
console.log(`  ${data.lines.length} خطوط، ${data.buses.length} باصات.`);
console.log("  الناقل : هاتف 0930000001 / الرمز 1234");
console.log("  الزبون : هاتف 0940000002 / الرمز 1234");
