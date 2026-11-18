package sy.buscredits.proto

import android.content.Context
import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/**
 * Le telephone du passager se comporte comme une carte sans contact.
 * Fonctionne meme si l'app n'est pas ouverte (ecran allume + telephone deverrouille).
 * Aucun acces internet ici. Toute la logique est dans CardLogic.
 */
class TicketHceService : HostApduService() {

    companion object {
        /** L'ecran passager s'abonne pour afficher "✅ jeton utilise". */
        @Volatile var listener: ((String) -> Unit)? = null
        private val main = Handler(Looper.getMainLooper())
        private var card: CardLogic? = null

        @Synchronized
        fun card(ctx: Context): CardLogic = card ?: CardLogic(
            PrefsTokenStore(Prefs(ctx)),
            OneTimeSigner { alias, data -> TokenVault.signOnce(alias, data) }
        ) { msg -> listener?.let { l -> main.post { l(msg) } } }.also { card = it }
    }

    override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray = card(applicationContext).process(apdu)

    override fun onDeactivated(reason: Int) { /* rien */ }
}

/** Jetons du telephone ranges dans les preferences (les cles, elles, sont dans la puce). */
class PrefsTokenStore(private val prefs: Prefs) : TokenStore {
    override fun nextActive(): StoredToken? {
        val a = prefs.tokens
        for (i in 0 until a.length()) {
            val o = a.getJSONObject(i)
            if (!o.optBoolean("burned")) return StoredToken(o.getString("tid"), o.getString("alias"), o.getString("token"))
        }
        return null
    }

    override fun markBurned(tid: String) {
        val a = prefs.tokens
        for (i in 0 until a.length()) if (a.getJSONObject(i).getString("tid") == tid) a.getJSONObject(i).put("burned", true)
        prefs.tokens = a
    }

    override fun activeCount(): Int = prefs.activeTokens()
}
