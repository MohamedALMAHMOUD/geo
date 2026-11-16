// Fonctions geographiques partagees.

// Distance en metres entre deux points (Haversine).
function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Interpolation lineaire sur un chemin (path = [[lat,lng],...]) a la position flottante t.
function pointOnPath(path, t) {
    if (!path || path.length === 0) return null;
    const max = path.length - 1;
    const tc = Math.max(0, Math.min(max, t));
    const i = Math.floor(tc);
    const frac = tc - i;
    const [lat1, lng1] = path[i];
    const [lat2, lng2] = path[Math.min(i + 1, max)];
    return { lat: lat1 + (lat2 - lat1) * frac, lng: lng1 + (lng2 - lng1) * frac };
}

module.exports = { distanceMeters, pointOnPath };
