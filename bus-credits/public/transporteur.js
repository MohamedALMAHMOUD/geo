// لوحة الناقل (بالعربية).
const API = "/api";
let token = localStorage.getItem("bc_token_t") || null;
let registerMode = false;

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

$("registerBtn").onclick = () => {
    if (!registerMode) {
        registerMode = true;
        show($("nameLbl"), true); show($("name"), true);
        $("registerBtn").textContent = "تأكيد إنشاء الحساب";
        return;
    }
    doAuth("/auth/register", { role: "transporteur", name: $("name").value });
};
$("loginBtn").onclick = () => doAuth("/auth/login", {});

async function doAuth(path, extra) {
    clearMsg($("authMsg"));
    try {
        const data = await api(path, { method: "POST", body: { phone: $("phone").value, pin: $("pin").value, ...extra } });
        token = data.token; localStorage.setItem("bc_token_t", token);
        await boot();
    } catch (e) { msg($("authMsg"), e.message, false); }
}

$("logoutBtn").onclick = () => {
    localStorage.removeItem("bc_token_t"); token = null;
    if (window._busTimer) clearInterval(window._busTimer);
    show($("app"), false); show($("authCard"), true); show($("logoutBtn"), false);
    show($("bottomNav"), false); $("whoami").textContent = "";
};

// ---------- التنقّل بين الصفحات (الشريط السفلي) ----------
function showPage(name) {
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + name));
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
    window.scrollTo(0, 0);
}
document.querySelectorAll(".bottom-nav button").forEach((b) => b.onclick = () => showPage(b.dataset.page));

async function boot() {
    try {
        const { user } = await api("/me");
        if (user.role !== "transporteur") { msg($("authMsg"), "هذا الحساب خاص بالزبون. استخدم حساب الزبون.", false); return; }
        $("whoami").textContent = user.name + " (ناقل)";
        show($("authCard"), false); show($("app"), true); show($("logoutBtn"), true);
        show($("bottomNav"), true); showPage("overview");
        await refresh();
        if (window._busTimer) clearInterval(window._busTimer);
        window._busTimer = setInterval(refresh, 4000); // تحديث حيّ
    } catch { localStorage.removeItem("bc_token_t"); token = null; }
}

async function refresh() {
    const d = await api("/transporteur/overview");
    const st = d.stats;
    $("sTrips").textContent = st.validatedTrips;
    $("sOwed").textContent = st.owedNetCredits;
    $("sCommission").textContent = st.commissionCredits;

    $("settlement").innerHTML = `<table>
        <tr><th>إجمالي الرحلات المُصدّقة</th><td>${st.validatedTrips}</td></tr>
        <tr><th>المبلغ الإجمالي</th><td>${st.owedGrossCredits} كريدت</td></tr>
        <tr><th>عمولة المنصّة (${st.commissionPct}%)</th><td>‑${st.commissionCredits} كريدت</td></tr>
        <tr><th><b>المستحق لك (صافي)</b></th><td><b>${st.owedNetCredits} كريدت</b></td></tr>
    </table>`;

    $("validations").innerHTML = (d.recentValidations && d.recentValidations.length)
        ? "<table><tr><th>الراكب</th><th>الخط</th><th>الأجرة</th><th>الوقت</th></tr>" +
          d.recentValidations.map((t) => `<tr><td>${t.clientName}</td><td>${t.lineName}</td><td>${t.priceCredits} كريدت</td><td class="muted">${new Date(t.createdAt).toLocaleString("ar")}</td></tr>`).join("") + "</table>"
        : "<span class='muted'>لا توجد رحلات مُصدّقة بعد.</span>";

    $("buses").innerHTML = (d.buses && d.buses.length)
        ? "<table><tr><th>الباص</th><th>الخط</th><th>الاتجاه</th><th>الموقع</th></tr>" +
          d.buses.map((b) => {
              const back = b.direction === "إياب";
              const pos = (b.lat != null) ? `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}` : "—";
              return `<tr><td>${b.label}</td><td>${b.lineName}</td>
                  <td><span class="tag-dir ${back ? "back" : "go"}">${b.direction}</span></td>
                  <td class="muted" style="direction:ltr">${pos}</td></tr>`;
          }).join("") + "</table>"
        : "<span class='muted'>لا توجد باصات.</span>";

    $("lines").innerHTML = d.lines.length
        ? "<table><tr><th>الخط</th><th>السعر</th></tr>" +
          d.lines.map((l) => `<tr><td>${l.name}</td><td>${l.priceCredits} كريدت</td></tr>`).join("") + "</table>"
        : "<span class='muted'>لا توجد خطوط.</span>";
}

// ---------- قارئ التذاكر (QR) ----------
async function doValidate(code) {
    const box = $("validateResult");
    box.innerHTML = "<span class='muted'>جارٍ التحقق…</span>";
    try {
        const r = await api("/ticket/validate", { method: "POST", body: { code } });
        box.innerHTML = `<div class="msg show ok">✅ تذكرة صالحة — ${r.riderName}<br>${r.lineName} • خُصم ${r.priceCredits} كريدت • رصيد الراكب: ${r.riderBalance}</div>`;
        refresh();
    } catch (e) {
        box.innerHTML = `<div class="msg show err">❌ ${e.message}</div>`;
    }
}

$("validateBtn").onclick = () => {
    const c = $("codeInput").value.trim();
    if (c) doValidate(c);
};

let qrScanner = null;
$("scanBtn").onclick = async () => {
    if (typeof Html5Qrcode === "undefined") { $("validateResult").innerHTML = "<div class='msg show err'>تعذّر تحميل قارئ الكاميرا (تحقّق من الاتصال). استخدم الإدخال اليدوي.</div>"; return; }
    try {
        qrScanner = new Html5Qrcode("reader");
        await qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 },
            (decoded) => { doValidate(decoded); stopScan(); },
            () => {});
    } catch (e) { $("validateResult").innerHTML = "<div class='msg show err'>تعذّر فتح الكاميرا. استخدم الإدخال اليدوي.</div>"; }
};
function stopScan() { if (qrScanner) { qrScanner.stop().then(() => qrScanner.clear()).catch(() => {}); qrScanner = null; } }
$("scanStop").onclick = stopScan;

window.confirmR = async (id) => { try { await api(`/transporteur/recharge/${id}/confirm`, { method: "POST" }); await refresh(); } catch (e) { alert(e.message); } };
window.rejectR = async (id) => { try { await api(`/transporteur/recharge/${id}/reject`, { method: "POST" }); await refresh(); } catch (e) { alert(e.message); } };

$("addLineBtn").onclick = async () => {
    clearMsg($("lineMsg"));
    try {
        await api("/lines", { method: "POST", body: { name: $("lName").value, priceCredits: Number($("lPrice").value), chamcashAccount: $("lAccount").value } });
        msg($("lineMsg"), "تمت إضافة الخط.", true);
        $("lName").value = ""; $("lAccount").value = "";
        await refresh();
    } catch (e) { msg($("lineMsg"), e.message, false); }
};

if (token) boot();
