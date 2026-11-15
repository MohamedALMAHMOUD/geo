// Dashboard transporteur.
const API = "/api";
let token = localStorage.getItem("bc_token_t") || null;
let registerMode = false;

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
    if (!res.ok) throw new Error(data.error || data.detail || "Erreur");
    return data;
}

$("registerBtn").onclick = () => {
    if (!registerMode) {
        registerMode = true;
        show($("nameLbl"), true); show($("name"), true);
        $("registerBtn").textContent = "Valider l'inscription";
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
    show($("app"), false); show($("authCard"), true); show($("logoutBtn"), false); $("whoami").textContent = "";
};

async function boot() {
    try {
        const { user } = await api("/me");
        if (user.role !== "transporteur") { msg($("authMsg"), "Ce compte est un client. Utilisez l'espace client.", false); return; }
        $("whoami").textContent = user.name + " (transporteur)";
        show($("authCard"), false); show($("app"), true); show($("logoutBtn"), true);
        await refresh();
    } catch { localStorage.removeItem("bc_token_t"); token = null; }
}

async function refresh() {
    const d = await api("/transporteur/overview");
    $("sPending").textContent = d.stats.pending;
    $("sRevenue").textContent = d.stats.revenueCredits;
    $("sTrips").textContent = d.stats.tripsCount;

    $("lines").innerHTML = d.lines.length
        ? "<table><tr><th>Ligne</th><th>Prix</th><th>ChamCash</th></tr>" +
          d.lines.map((l) => `<tr><td>${l.name}</td><td>${l.priceCredits} cr.</td><td><code>${l.chamcashAccount}</code></td></tr>`).join("") + "</table>"
        : "<span class='muted'>Aucune ligne.</span>";

    $("recharges").innerHTML = d.recharges.length
        ? "<table><tr><th>Client</th><th>Ligne</th><th>Montant</th><th>Réf.</th><th>État</th><th></th></tr>" +
          d.recharges.map((r) => `<tr>
              <td>${r.clientName}<br><span class="muted">${r.clientPhone}</span></td>
              <td>${r.lineName}</td>
              <td>${r.amountCredits} cr.</td>
              <td><code>${r.reference}</code></td>
              <td><span class="pill ${r.status}">${r.status}</span></td>
              <td>${r.status === "pending"
                  ? `<button class="secondary" style="padding:6px 10px;margin:0" onclick="confirmR('${r.id}')">Confirmer</button>
                     <button class="danger" style="padding:6px 10px;margin:4px 0 0" onclick="rejectR('${r.id}')">Rejeter</button>`
                  : "—"}</td></tr>`).join("") + "</table>"
        : "<span class='muted'>Aucune recharge.</span>";

    $("ledger").innerHTML = d.ledger.length
        ? "<table><tr><th>Compte</th><th>Montant</th><th>Réf.</th><th>Statut</th></tr>" +
          d.ledger.map((t) => `<tr><td><code>${t.account}</code></td><td>${t.amountCredits}</td><td><code>${t.reference}</code></td><td>${t.consumed ? "utilisé" : "disponible"}</td></tr>`).join("") + "</table>"
        : "<span class='muted'>Aucun transfert.</span>";
}

window.confirmR = async (id) => { try { await api(`/transporteur/recharge/${id}/confirm`, { method: "POST" }); await refresh(); } catch (e) { alert(e.message); } };
window.rejectR = async (id) => { try { await api(`/transporteur/recharge/${id}/reject`, { method: "POST" }); await refresh(); } catch (e) { alert(e.message); } };

$("addLineBtn").onclick = async () => {
    clearMsg($("lineMsg"));
    try {
        await api("/lines", { method: "POST", body: { name: $("lName").value, priceCredits: Number($("lPrice").value), chamcashAccount: $("lAccount").value } });
        msg($("lineMsg"), "Ligne ajoutée.", true);
        $("lName").value = ""; $("lAccount").value = "";
        await refresh();
    } catch (e) { msg($("lineMsg"), e.message, false); }
};

if (token) boot();
