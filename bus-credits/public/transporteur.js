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
    show($("app"), false); show($("authCard"), true); show($("logoutBtn"), false); $("whoami").textContent = "";
};

async function boot() {
    try {
        const { user } = await api("/me");
        if (user.role !== "transporteur") { msg($("authMsg"), "هذا الحساب خاص بالزبون. استخدم حساب الزبون.", false); return; }
        $("whoami").textContent = user.name + " (ناقل)";
        show($("authCard"), false); show($("app"), true); show($("logoutBtn"), true);
        await refresh();
        if (window._busTimer) clearInterval(window._busTimer);
        window._busTimer = setInterval(refresh, 4000); // تحديث حيّ
    } catch { localStorage.removeItem("bc_token_t"); token = null; }
}

async function refresh() {
    const d = await api("/transporteur/overview");
    $("sPending").textContent = d.stats.pending;
    $("sRevenue").textContent = d.stats.revenueCredits;
    $("sTrips").textContent = d.stats.tripsCount;

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
        ? "<table><tr><th>الخط</th><th>السعر</th><th>شام كاش</th></tr>" +
          d.lines.map((l) => `<tr><td>${l.name}</td><td>${l.priceCredits} كريدت</td><td style="direction:ltr"><code>${l.chamcashAccount}</code></td></tr>`).join("") + "</table>"
        : "<span class='muted'>لا توجد خطوط.</span>";

    $("recharges").innerHTML = d.recharges.length
        ? "<table><tr><th>الزبون</th><th>الخط</th><th>المبلغ</th><th>المرجع</th><th>الحالة</th><th></th></tr>" +
          d.recharges.map((r) => `<tr>
              <td>${r.clientName}<br><span class="muted" style="direction:ltr">${r.clientPhone}</span></td>
              <td>${r.lineName}</td>
              <td>${r.amountCredits} كريدت</td>
              <td style="direction:ltr"><code>${r.reference}</code></td>
              <td><span class="pill ${r.status}">${STATUS_AR[r.status] || r.status}</span></td>
              <td>${r.status === "pending"
                  ? `<button class="secondary" style="padding:6px 10px;margin:0" onclick="confirmR('${r.id}')">تأكيد</button>
                     <button class="danger" style="padding:6px 10px;margin:4px 0 0" onclick="rejectR('${r.id}')">رفض</button>`
                  : "—"}</td></tr>`).join("") + "</table>"
        : "<span class='muted'>لا توجد طلبات.</span>";

    $("ledger").innerHTML = d.ledger.length
        ? "<table><tr><th>الحساب</th><th>المبلغ</th><th>المرجع</th><th>الحالة</th></tr>" +
          d.ledger.map((t) => `<tr><td style="direction:ltr"><code>${t.account}</code></td><td>${t.amountCredits}</td><td style="direction:ltr"><code>${t.reference}</code></td><td>${t.consumed ? "مُستخدَم" : "متاح"}</td></tr>`).join("") + "</table>"
        : "<span class='muted'>لا توجد تحويلات.</span>";
}

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
