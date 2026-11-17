// Configuration de la plateforme.
// Le client recharge en payant NOTRE compte ShamCash (que nous controlons),
// pas celui des societes. On verifie l'arrivee via NOTRE propre acces API ShamCash.
module.exports = {
    // Notre compte ShamCash (destinataire des recharges). A mettre dans .env en prod.
    PLATFORM_CHAMCASH: process.env.PLATFORM_CHAMCASH || "CHAM-PLATFORM-0999",
    // Commission plateforme en % (prelevee sur le reglement des societes).
    COMMISSION_PCT: Number(process.env.COMMISSION_PCT || 10),
    // Duree de validite d'un ticket QR (minutes). Courte = anti-fraude hors-ligne.
    TICKET_TTL_MIN: Number(process.env.TICKET_TTL_MIN || 2)
};
