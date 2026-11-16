// لوحة الزبون — المنطق والاتصال بالـ API (بالعربية).
const API = "/api";
let token = localStorage.getItem("bc_token") || null;
let registerMode = false;
let currentRecharge = null;

// الخريطة والباصات
let map = null, meMarker = null, busMarkers = {}, routeLayers = [];
let myPos = { lat: 33.5138, lng: 36.2765 }; // دمشق افتراضيًا
let dirFilter = "all";
let busTimer = null;
let linesCache = [];

const STATUS_AR = { pending: "معلّق", confirmed: "مؤكد", rejected: "مرفوض" };
const $ = (id) => document.getElementById(id);
function show(el, on = true) { el.classList.toggle("hidden", !on); }
function msg(el, text, ok = true) { el.textContent = text; el.className = "msg show " + (ok ? "ok" : "err"); }
function clearMsg(el) { el.className = "msg"; }

async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(API + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || "خطأ");
    return data;
}

// ---------- تسجيل الدخول ----------
$("registerBtn").onclick = () => {
    if (!registerMode) {
        registerMode = true;
        show($("nameLbl"), true); show($("name"), true);
        $("registerBtn").textContent = "تأكيد إنشاء الحساب";
        return;
    }
    doAuth("/auth/register", { role: "client", name: $("name").value });
};
$("loginBtn").onclick = () => doAuth("/auth/login", {});

async function doAuth(path, extra) {
    clearMsg($("authMsg"));
    try {
        const data = await api(path, { method: "POST", body: { phone: $("phone").value, pin: $("pin").value, ...extra } });
        token = data.token; localStorage.setItem("bc_token", token);
        await boot();
    } catch (e) { msg($("authMsg"), e.message, false); }
}

$("logoutBtn").onclick = () => {
    localStorage.removeItem("bc_token"); token = null;
    if (busTimer) clearInterval(busTimer);
    show($("app"), false); show($("authCard"), true); show($("logoutBtn"), false);
    $("whoami").textContent = "";
};

// ---------- التطبيق ----------
async function boot() {
    try {
        const { user } = await api("/me");
        if (user.role !== "client") { msg($("authMsg"), "هذا الحساب خاص بالناقل. استخدم حساب الناقل.", false); return; }
        $("whoami").textContent = user.name + " (زبون)";
        show($("authCard"), false); show($("app"), true); show($("logoutBtn"), true);
        await loadLines(); await refresh(); initMap();
    } catch { localStorage.removeItem("bc_token"); token = null; }
}

async function loadLines() {
    const { lines } = await api("/lines");
    linesCache = lines;
    const opts = lines.map((l) => `<option value="${l.id}" data-price="${l.priceCredits}">${l.name} — ${l.priceCredits} كريدت</option>`).join("");
    $("lineSelect").innerHTML = opts;
    $("tripLineSelect").innerHTML = opts;
}

async function refresh() {
    const { balanceCredits } = await api("/wallet");
    $("balance").textContent = balanceCredits;
    const { recharges, trips } = await api("/history");
    const items = [
        ...recharges.map((r) => ({ t: r.createdAt, txt: `شحن ${r.amountCredits} كريدت`, status: r.status })),
        ...trips.map((t) => ({ t: t.createdAt, txt: `رحلة ‑${t.priceCredits} كريدت`, status: "confirmed" }))
    ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 15);
    $("history").innerHTML = items.length
        ? "<table><tr><th>التاريخ</th><th>العملية</th><th>الحالة</th></tr>" +
          items.map((i) => `<tr><td>${new Date(i.t).toLocaleString("ar")}</td><td>${i.txt}</td><td><span class="pill ${i.status}">${STATUS_AR[i.status] || i.status}</span></td></tr>`).join("") +
          "</table>"
        : "<span class='muted'>لا توجد عمليات.</span>";
}

// ========================================================================
//  الخريطة والباصات (الاتجاهان)
// ========================================================================
function initMap() {
    if (map) return;
    if (typeof L === "undefined") { // Leaflet non chargé (hors ligne) -> on garde la liste
        $("map").innerHTML = '<div class="muted" style="padding:20px;text-align:center">تعذّر تحميل الخريطة (تحقّق من الاتصال). قائمة الباصات تعمل بالأسفل.</div>';
        return;
    }
    map = L.map("map").setView([myPos.lat, myPos.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);

    // رسم مسارات الخطوط
    linesCache.forEach((l) => {
        if (l.path && l.path.length > 1) {
            routeLayers.push(L.polyline(l.path, { color: "#3b82f6", weight: 4, opacity: 0.5 }).addTo(map));
        }
    });
}

$("dirSeg").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
        dirFilter = b.dataset.dir;
        $("dirSeg").querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        renderBuses(lastBuses);
    };
});

$("locateBtn").onclick = () => {
    clearMsg($("busMsg"));
    if (!navigator.geolocation) { startBusTracking(); return; }
    navigator.geolocation.getCurrentPosition(
        (p) => { myPos = { lat: p.coords.latitude, lng: p.coords.longitude }; startBusTracking(); },
        () => { msg($("busMsg"), "تعذّر تحديد الموقع، نعرض موقعًا افتراضيًا في دمشق.", false); startBusTracking(); },
        { enableHighAccuracy: true, timeout: 6000 }
    );
};

function startBusTracking() {
    if (map) {
        map.setView([myPos.lat, myPos.lng], 14);
        if (meMarker) meMarker.remove();
        meMarker = L.marker([myPos.lat, myPos.lng], {
            icon: L.divIcon({ className: "", html: '<div class="me-marker"></div>', iconSize: [18, 18] })
        }).addTo(map).bindPopup("موقعي");
    }
    updateBuses();
    if (busTimer) clearInterval(busTimer);
    busTimer = setInterval(updateBuses, 3000); // تحديث حيّ كل 3 ثوانٍ
}

let lastBuses = [];
async function updateBuses() {
    try {
        const { buses } = await api(`/buses/near?lat=${myPos.lat}&lng=${myPos.lng}&radiusKm=8`);
        lastBuses = buses;
        renderBuses(buses);
    } catch (e) { /* silencieux */ }
}

function renderBuses(buses) {
    const filtered = (dirFilter === "all") ? buses : buses.filter((b) => b.direction === dirFilter);

    // marqueurs sur la carte (si la carte est disponible)
    if (map) {
        const seen = new Set();
        buses.forEach((b) => {
            seen.add(b.id);
            const back = b.direction === "إياب";
            const html = `<div class="bus-marker ${back ? "back" : ""}">🚌</div>`;
            if (busMarkers[b.id]) {
                busMarkers[b.id].setLatLng([b.lat, b.lng]);
            } else {
                busMarkers[b.id] = L.marker([b.lat, b.lng], {
                    icon: L.divIcon({ className: "", html, iconSize: [30, 30] })
                }).addTo(map);
            }
            busMarkers[b.id].bindPopup(`${b.label} — ${b.direction}<br>${b.lineName}<br>${b.distanceMeters} م • ~${b.etaMin} د`);
        });
        Object.keys(busMarkers).forEach((id) => { if (!seen.has(id)) { busMarkers[id].remove(); delete busMarkers[id]; } });
    }

    // liste
    if (!filtered.length) { $("busList").innerHTML = "<span class='muted'>لا توجد باصات قريبة حاليًا.</span>"; return; }
    $("busList").innerHTML = filtered.map((b) => {
        const back = b.direction === "إياب";
        return `<div class="bus-item">
            <span style="font-size:20px">🚌</span>
            <div>
                <div class="dir">${b.label}
                    <span class="tag-dir ${back ? "back" : "go"}">${b.direction}</span>
                    ${b.approaching ? '<span class="tag-appr">يقترب</span>' : ''}
                </div>
                <div class="muted">${b.lineName}</div>
            </div>
            <div class="meta"><b>${b.distanceMeters} م</b><br><span class="muted">~${b.etaMin} دقيقة</span></div>
        </div>`;
    }).join("");
}

// ---------- الشحن ----------
$("rechargeBtn").onclick = async () => {
    clearMsg($("rechargeMsg"));
    try {
        const data = await api("/recharge", { method: "POST", body: { lineId: $("lineSelect").value, amountCredits: Number($("amount").value) } });
        currentRecharge = data.recharge;
        const i = data.instructions;
        $("rechargeInstr").innerHTML = `
            <b>تعليمات الدفع عبر شام كاش</b><br>
            الحساب: <code>${i.chamcashAccount}</code><br>
            المبلغ: <code>${i.amountCredits}</code> ل.س (جديدة)<br>
            الرقم المرجعي: <code>${i.reference}</code>
            <div class="row">
                <button id="simBtn" class="ghost">١) محاكاة التحويل عبر شام كاش</button>
                <button id="verifyBtn">٢) تحقّق وأضف الرصيد</button>
            </div>
            <p class="muted">في الواقع تتم الخطوة ١ داخل تطبيق شام كاش. هنا محاكاة للعرض فقط.</p>`;
        show($("rechargeInstr"), true);
        $("simBtn").onclick = simulateTransfer;
        $("verifyBtn").onclick = verifyRecharge;
    } catch (e) { msg($("rechargeMsg"), e.message, false); }
};

async function simulateTransfer() {
    try {
        await api(`/recharge/${currentRecharge.id}/simulate-transfer`, { method: "POST" });
        msg($("rechargeMsg"), "تمت محاكاة التحويل عبر شام كاش. اضغط «تحقّق وأضف الرصيد».", true);
    } catch (e) { msg($("rechargeMsg"), e.message, false); }
}

async function verifyRecharge() {
    try {
        const data = await api(`/recharge/${currentRecharge.id}/verify`, { method: "POST" });
        msg($("rechargeMsg"), `تم تأكيد الشحن ✅ الرصيد الجديد: ${data.balanceCredits} كريدت.`, true);
        show($("rechargeInstr"), false);
        await refresh();
    } catch (e) { msg($("rechargeMsg"), e.message + " — يمكن للناقل أيضًا التأكيد يدويًا.", false); }
}

// ---------- الرحلة ----------
$("tripBtn").onclick = async () => {
    clearMsg($("tripMsg"));
    try {
        const data = await api("/trip", { method: "POST", body: { lineId: $("tripLineSelect").value } });
        msg($("tripMsg"), `تم تأكيد الرحلة 🚌 الرصيد المتبقي: ${data.balanceCredits} كريدت.`, true);
        await refresh();
    } catch (e) { msg($("tripMsg"), e.message, false); }
};

if (token) boot();
