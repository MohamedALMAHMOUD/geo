// =============================================================================
//  MODULE CHAMCASH — VERSION SIMULEE
// =============================================================================
//  But : verifier qu'un client a bien transfere de l'argent vers le compte
//  ChamCash d'un transporteur, avant de convertir ce montant en credits.
//
//  Ici tout est SIMULE : il n'y a aucun appel reseau reel.
//  Un "grand livre" (ledger) en memoire represente les transferts recus.
//
//  >>> POUR PASSER EN REEL PLUS TARD :
//      Ne changez QUE la fonction verifyTransfer() ci-dessous pour qu'elle
//      interroge l'API officielle ChamCash (avec vos cles developpeur).
//      Le reste de l'application n'a pas besoin d'etre modifie.
// =============================================================================

// Ledger simule : transferts "recus" par les comptes ChamCash des transporteurs.
// { account, amountCredits, reference, consumed }
const simulatedLedger = [];

/**
 * Simule l'arrivee d'un transfert sur un compte ChamCash.
 * Dans la vraie vie, c'est le client qui envoie l'argent depuis son appli ChamCash.
 * Ici, on l'injecte manuellement (bouton "Simuler le transfert" cote client/demo).
 */
function simulateIncomingTransfer({ account, amountCredits, reference }) {
    simulatedLedger.push({
        account: String(account),
        amountCredits: Number(amountCredits),
        reference: String(reference),
        consumed: false,
        at: new Date().toISOString()
    });
}

/**
 * Verifie qu'un transfert correspondant existe sur le compte ChamCash du transporteur.
 * Retourne { found: true } et marque le transfert comme consomme si tout correspond.
 *
 * @param {string} account        Compte ChamCash du transporteur (destinataire)
 * @param {number} amountCredits  Montant attendu (en credits = L.S. nouvelles)
 * @param {string} reference      Reference unique de la demande de recharge
 */
async function verifyTransfer({ account, amountCredits, reference }) {
    // --- Simulation : on cherche dans le ledger ---
    const entry = simulatedLedger.find(
        (t) =>
            !t.consumed &&
            t.account === String(account) &&
            t.reference === String(reference) &&
            Number(t.amountCredits) === Number(amountCredits)
    );

    if (!entry) {
        return { found: false, reason: "Aucun transfert correspondant trouve (montant/reference)." };
    }

    entry.consumed = true;
    return { found: true, chamcashRef: `SIM-${entry.at}` };
}

/** Pour le dashboard transporteur : voir ce qui est "arrive" (simule). */
function listLedger(account) {
    return simulatedLedger
        .filter((t) => !account || t.account === String(account))
        .map((t) => ({ ...t }));
}

module.exports = { verifyTransfer, simulateIncomingTransfer, listLedger };
