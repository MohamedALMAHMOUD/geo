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
    if ($("ticketLine")) $("ticketLine").innerHTML = opts;
}

async function refresh() {
    const { balanceCredits } = await api("/wallet");
    $("balance").textContent = balanceCredits;
    const { recharges, trips } = await api("/history");
    const items = [
        ...recharges.map((r) => ({ t: r.createdAt, txt: `شحن ${r.amountCredits} كريدت`, status: r.status })),
        ...trips.map((t) => ({ t: t.createdAt, txt: `رحلة ‑${t.priceCredits} كريدت`, status: "confirmed" }))
    ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 15);
    loadFavorites();
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

// ========================================================================
//  البحث عن خط (من / إلى) + المفضّلة
// ========================================================================
let fromPlace = null, toPlace = null;
let favIds = new Set();

async function geocodeField(text, setPlace, candsEl) {
    candsEl.innerHTML = "";
    if (!text.trim()) return;
    try {
        const { results } = await api("/geocode?q=" + encodeURIComponent(text.trim()));
        if (!results.length) { candsEl.innerHTML = "<span class='muted'>لا يوجد مكان مطابق.</span>"; return; }
        if (results.length === 1) { setPlace(results[0]); candsEl.innerHTML = `<span style="color:var(--accent)">✓ ${results[0].name}</span>`; return; }
        candsEl.innerHTML = results.map((r, i) => `<button class="ghost" style="margin:4px 4px 0 0;padding:6px 10px" data-i="${i}">📍 ${r.name}</button>`).join("");
        candsEl.querySelectorAll("button").forEach((b) => b.onclick = () => {
            const r = results[b.dataset.i];
            setPlace(r); candsEl.innerHTML = `<span style="color:var(--accent)">✓ ${r.name}</span>`;
        });
    } catch (e) { candsEl.innerHTML = `<span class='muted'>${e.message}</span>`; }
}

$("fromBtn").onclick = () => geocodeField($("fromText").value, (p) => fromPlace = p, $("fromCands"));
$("toBtn").onclick = () => geocodeField($("toText").value, (p) => toPlace = p, $("toCands"));

$("searchBtn").onclick = async () => {
    clearMsg($("searchMsg"));
    if (!fromPlace || !toPlace) { msg($("searchMsg"), "اختر نقطة الانطلاق والوجهة أولًا (اضغط «بحث» بجانب كل حقل).", false); return; }
    try {
        const { itineraries } = await api("/plan", { method: "POST", body: { from: fromPlace, to: toPlace } });
        if (!itineraries.length) { $("routes").innerHTML = "<p class='muted'>لا يوجد مسار بين هذين المكانين عبر الشبكة الحالية.</p>"; return; }
        const it = itineraries[0];
        const legsHtml = it.legs.map((l) => {
            if (l.type === "walk") return `<div style="padding:6px 0">🚶 مشي: <b>${l.fromName}</b> ← <b>${l.toName}</b> <span class="muted">(~${l.min} د)</span></div>`;
            if (l.type === "transfer") return `<div style="padding:6px 0;color:#f59e0b">🔁 تبديل في <b>${l.atName}</b> <span class="muted">(~${l.min} د انتظار)</span></div>`;
            const back = l.direction === "إياب";
            const star = favIds.has(l.lineId) ? "⭐" : "☆";
            return `<div style="padding:8px 0;border-top:1px solid #2a3850">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <b>🚌 ${l.lineName}</b>
                    <span style="cursor:pointer;font-size:20px" data-fav="${l.lineId}">${star}</span>
                </div>
                <div style="margin:4px 0">
                    <span class="tag-dir ${back ? "back" : "go"}">${l.direction}</span>
                    <span class="muted">${l.min} د • ${l.stops} محطات</span>
                </div>
                اركب من <b>${l.boardName}</b> وانزل في <b>${l.alightName}</b>
            </div>`;
        }).join("");
        $("routes").innerHTML = `<div class="instr" style="margin-top:10px">
            <div style="font-size:16px"><b>⏱️ ~${it.totalMin} دقيقة</b> • 🔁 ${it.transfers} تبديل • 💳 ${it.fareCredits} كريدت</div>
            <div style="margin-top:8px">${legsHtml}</div>
        </div>`;
        $("routes").querySelectorAll("[data-fav]").forEach((el) => el.onclick = async () => {
            const id = el.dataset.fav, isFav = el.textContent.trim() === "⭐";
            try {
                if (isFav) await api("/favorites/" + id, { method: "DELETE" });
                else await api("/favorites", { method: "POST", body: { lineId: id } });
                el.textContent = isFav ? "☆" : "⭐";
                loadFavorites();
            } catch (e) { alert(e.message); }
        });
    } catch (e) { msg($("searchMsg"), e.message, false); }
};

// ---------- تذكرة QR ----------
let ticketPoll = null;
$("genTicket").onclick = async () => {
    clearMsg($("ticketMsg"));
    try {
        const { ticket, qrPayload } = await api("/ticket/create", { method: "POST", body: { lineId: $("ticketLine").value } });
        show($("ticketBox"), true);
        $("qr").innerHTML = "";
        if (typeof QRCode !== "undefined") {
            new QRCode($("qr"), { text: qrPayload, width: 180, height: 180 });
        } else {
            $("qr").innerHTML = `<div style="color:#000;font-weight:700;padding:20px">${qrPayload}</div>`;
        }
        $("ticketCode").textContent = qrPayload;
        $("ticketStatus").textContent = "⏳ بانتظار التدقيق… اعرض الرمز للسائق";
        $("ticketStatus").style.color = "#f59e0b";
        if (ticketPoll) clearInterval(ticketPoll);
        ticketPoll = setInterval(async () => {
            try {
                const { ticket: t } = await api("/ticket/" + ticket.id);
                if (t.status === "used") {
                    $("ticketStatus").textContent = "✅ تم التحقق وخُصمت الأجرة";
                    $("ticketStatus").style.color = "#22c55e";
                    clearInterval(ticketPoll); refresh();
                } else if (t.status === "expired") {
                    $("ticketStatus").textContent = "⌛ انتهت صلاحية التذكرة";
                    $("ticketStatus").style.color = "#ef4444";
                    clearInterval(ticketPoll);
                }
            } catch { clearInterval(ticketPoll); }
        }, 3000);
    } catch (e) { msg($("ticketMsg"), e.message, false); }
};

async function loadFavorites() {
    try {
        const { favorites } = await api("/favorites");
        favIds = new Set(favorites.map((f) => f.id));
        $("favs").innerHTML = favorites.length
            ? favorites.map((f) => `<div class="bus-item">
                <div style="flex:1">
                    <b>${f.name}</b><br>
                    <span class="muted">${(f.stops || []).map((s) => s.name).join(" ← ")}</span>
                </div>
                <button class="danger" style="margin:0;padding:6px 10px" data-del="${f.id}">إزالة</button>
            </div>`).join("")
            : "<span class='muted'>لا توجد خطوط مفضّلة بعد. أضف خطًا بالنجمة من نتائج البحث.</span>";
        $("favs").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
            try { await api("/favorites/" + b.dataset.del, { method: "DELETE" }); loadFavorites(); } catch (e) { alert(e.message); }
        });
    } catch { /* non connecté */ }
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
