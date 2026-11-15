// Dashboard client : logique d'appel a l'API.
const API = "/api";
let token = localStorage.getItem("bc_token") || null;
let registerMode = false;
let currentRecharge = null;

const $ = (id) => document.getElementById(id);
function show(el, on = true) { el.classList.toggle("hidden", !on); }
function msg(el, text, ok = true) {
    el.textContent = text;
    el.className = "msg show " + (ok ? "ok" : "err");
}
function clearMsg(el) { el.className = "msg"; }

async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(API + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || "Erreur");
    return data;
}

// ---------- AUTH ----------
$("registerBtn").onclick = () => {
    if (!registerMode) {
        registerMode = true;
        show($("nameLbl"), true); show($("name"), true);
        $("registerBtn").textContent = "Valider l'inscription";
        return;
    }
    doAuth("/auth/register", { role: "client", name: $("name").value });
};
$("loginBtn").onclick = () => doAuth("/auth/login", {});

async function doAuth(path, extra) {
    clearMsg($("authMsg"));
    try {
        const data = await api(path, { method: "POST", body: { phone: $("phone").value, pin: $("pin").value, ...extra } });
        token = data.token;
        localStorage.setItem("bc_token", token);
        await boot();
    } catch (e) { msg($("authMsg"), e.message, false); }
}

$("logoutBtn").onclick = () => {
    localStorage.removeItem("bc_token"); token = null;
    show($("app"), false); show($("authCard"), true); show($("logoutBtn"), false);
    $("whoami").textContent = "";
};

// ---------- APP ----------
async function boot() {
    try {
        const { user } = await api("/me");
        if (user.role !== "client") { msg($("authMsg"), "Ce compte est un transporteur. Utilisez l'espace transporteur.", false); return; }
        $("whoami").textContent = user.name + " (client)";
        show($("authCard"), false); show($("app"), true); show($("logoutBtn"), true);
        await loadLines(); await refresh();
    } catch { localStorage.removeItem("bc_token"); token = null; }
}

async function loadLines() {
    const { lines } = await api("/lines");
    const opts = lines.map((l) => `<option value="${l.id}" data-price="${l.priceCredits}">${l.name} — ${l.priceCredits} cr.</option>`).join("");
    $("lineSelect").innerHTML = opts;
    $("tripLineSelect").innerHTML = opts;
}

async function refresh() {
    const { balanceCredits } = await api("/wallet");
    $("balance").textContent = balanceCredits;
    const { recharges, trips } = await api("/history");
    const items = [
        ...recharges.map((r) => ({ t: r.createdAt, txt: `Recharge ${r.amountCredits} cr.`, status: r.status })),
        ...trips.map((t) => ({ t: t.createdAt, txt: `Trajet -${t.priceCredits} cr.`, status: "confirmed" }))
    ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 15);
    $("history").innerHTML = items.length
        ? "<table><tr><th>Date</th><th>Opération</th><th>État</th></tr>" +
          items.map((i) => `<tr><td>${new Date(i.t).toLocaleString("fr-FR")}</td><td>${i.txt}</td><td><span class="pill ${i.status}">${i.status}</span></td></tr>`).join("") +
          "</table>"
        : "<span class='muted'>Aucune opération.</span>";
}

// ---------- RECHARGE ----------
$("rechargeBtn").onclick = async () => {
    clearMsg($("rechargeMsg"));
    try {
        const data = await api("/recharge", { method: "POST", body: { lineId: $("lineSelect").value, amountCredits: Number($("amount").value) } });
        currentRecharge = data.recharge;
        const i = data.instructions;
        $("rechargeInstr").innerHTML = `
            <b>Instructions de paiement ChamCash</b><br>
            Compte : <code>${i.chamcashAccount}</code><br>
            Montant : <code>${i.amountCredits}</code> L.S. (nouvelles)<br>
            Référence : <code>${i.reference}</code>
            <div class="row">
                <button id="simBtn" class="ghost">1) Simuler le transfert ChamCash</button>
                <button id="verifyBtn">2) Vérifier & créditer</button>
            </div>
            <p class="muted">En réel, l'étape 1 se fait dans l'application ChamCash. Ici elle est simulée pour la démo.</p>`;
        show($("rechargeInstr"), true);
        $("simBtn").onclick = simulateTransfer;
        $("verifyBtn").onclick = verifyRecharge;
    } catch (e) { msg($("rechargeMsg"), e.message, false); }
};

async function simulateTransfer() {
    try {
        await api(`/recharge/${currentRecharge.id}/simulate-transfer`, { method: "POST" });
        msg($("rechargeMsg"), "Transfert ChamCash simulé. Cliquez sur « Vérifier & créditer ».", true);
    } catch (e) { msg($("rechargeMsg"), e.message, false); }
}

async function verifyRecharge() {
    try {
        const data = await api(`/recharge/${currentRecharge.id}/verify`, { method: "POST" });
        msg($("rechargeMsg"), `Recharge confirmée ✅ Nouveau solde : ${data.balanceCredits} crédits.`, true);
        show($("rechargeInstr"), false);
        await refresh();
    } catch (e) { msg($("rechargeMsg"), e.message + " — le transporteur peut aussi confirmer manuellement.", false); }
}

// ---------- TRAJET ----------
$("tripBtn").onclick = async () => {
    clearMsg($("tripMsg"));
    try {
        const data = await api("/trip", { method: "POST", body: { lineId: $("tripLineSelect").value } });
        msg($("tripMsg"), `Trajet validé 🚌 Solde restant : ${data.balanceCredits} crédits.`, true);
        await refresh();
    } catch (e) { msg($("tripMsg"), e.message, false); }
};

if (token) boot();
