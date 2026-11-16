// Gazetteer (دليل أماكن) de demonstration pour Damas + definition des lignes.
// Source unique de verite : sert a construire les traces ET le geocodage texte.
// A remplacer plus tard par les vraies lignes/arrets et un vrai geocodeur.

// Quartiers / reperes de Damas avec coordonnees approximatives.
const PLACES = {
    mazzeh:     { name: "المزة",        lat: 33.5000, lng: 36.2450, aliases: ["مزة"] },
    kafrsousa:  { name: "كفرسوسة",      lat: 33.4950, lng: 36.2650, aliases: [] },
    malki:      { name: "المالكي",      lat: 33.5150, lng: 36.2750, aliases: ["ابو رمانة", "أبو رمانة"] },
    university: { name: "جامعة دمشق",   lat: 33.5130, lng: 36.2820, aliases: ["الجامعة", "البرامكة", "برامكة"] },
    salhiyya:   { name: "الصالحية",     lat: 33.5160, lng: 36.2900, aliases: ["الصالحيّة"] },
    hijaz:      { name: "الحجاز",       lat: 33.5095, lng: 36.2960, aliases: ["محطة الحجاز", "القنوات"] },
    midan:      { name: "الميدان",      lat: 33.4950, lng: 36.2950, aliases: ["ميدان"] },
    marjeh:     { name: "المرجة",       lat: 33.5110, lng: 36.3050, aliases: ["ساحة المرجة"] },
    babtouma:   { name: "باب توما",     lat: 33.5155, lng: 36.3170, aliases: [] },
    babsharqi:  { name: "باب شرقي",     lat: 33.5110, lng: 36.3180, aliases: [] },
    abbasiyyin: { name: "العباسيين",    lat: 33.5230, lng: 36.3200, aliases: ["ساحة العباسيين", "كراج العباسيين"] },
    ruknaddin:  { name: "ركن الدين",    lat: 33.5300, lng: 36.2950, aliases: [] },
    barzeh:     { name: "برزة",         lat: 33.5450, lng: 36.3150, aliases: [] }
};

// Lignes : suite d'arrets (cles de PLACES), dans le sens "ذهاب" (de -> vers).
const LINES_DEF = [
    { name: "الخط ١: المزة ↔ باب توما",      account: "CHAM-700100", stops: ["mazzeh", "malki", "salhiyya", "marjeh", "babtouma"], buses: 2 },
    { name: "الخط ٢: الميدان ↔ ركن الدين",   account: "CHAM-700200", stops: ["midan", "hijaz", "salhiyya", "ruknaddin"],          buses: 1 },
    { name: "الخط ٣: كفرسوسة ↔ العباسيين",   account: "CHAM-700300", stops: ["kafrsousa", "university", "marjeh", "babsharqi", "abbasiyyin"], buses: 1 },
    { name: "الخط ٤: المزة ↔ برزة",          account: "CHAM-700400", stops: ["mazzeh", "malki", "ruknaddin", "barzeh"],            buses: 0 }
];

// Normalisation arabe (enleve les diacritiques, unifie alef/ya/ta marbouta).
function normalizeAr(s) {
    return String(s || "")
        .replace(/[ً-ٰٟ]/g, "")   // harakat
        .replace(/[إأآا]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/\s+/g, " ")
        .trim();
}

// Recherche texte -> liste de lieux candidats { key, name, lat, lng }.
function searchPlaces(q) {
    const nq = normalizeAr(q);
    if (!nq) return [];
    const out = [];
    for (const [key, p] of Object.entries(PLACES)) {
        const hay = [p.name, ...(p.aliases || [])].map(normalizeAr);
        if (hay.some((h) => h.includes(nq) || nq.includes(h))) {
            out.push({ key, name: p.name, lat: p.lat, lng: p.lng });
        }
    }
    return out;
}

function stopsOf(def) {
    return def.stops.map((k) => ({ key: k, name: PLACES[k].name, lat: PLACES[k].lat, lng: PLACES[k].lng }));
}

module.exports = { PLACES, LINES_DEF, searchPlaces, stopsOf, normalizeAr };
