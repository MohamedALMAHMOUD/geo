package sy.buscredits.proto

import org.json.JSONObject

/** Un jeton stocke dans le telephone : l'alias pointe vers sa cle dans la puce. */
data class StoredToken(val tid: String, val alias: String, val token: String)

interface TokenStore {
    fun nextActive(): StoredToken?
    fun markBurned(tid: String)
    fun activeCount(): Int
}

/** Signe une seule fois avec la cle "alias" puis la cle disparait. Retourne une signature DER. */
fun interface OneTimeSigner {
    fun signOnce(alias: String, data: ByteArray): ByteArray
}

/**
 * Cote TELEPHONE (carte emulee) : traite les commandes NFC de la machine.
 * Logique pure, sans Android : utilisee par TicketHceService et par les tests.
 */
class CardLogic(
    private val store: TokenStore,
    private val signer: OneTimeSigner,
    private val onEvent: (String) -> Unit = {}
) {
    private var lastChallenge: String? = null
    private var lastResponse: ByteArray? = null
    private var buffer = ByteArray(0)

    @Synchronized
    fun process(apdu: ByteArray): ByteArray {
        if (apdu.size < 4) return Proto.SW_UNKNOWN
        if (apdu[0] == 0x00.toByte() && apdu[1] == 0xA4.toByte()) return Proto.SW_OK   // SELECT

        return when (apdu[1]) {
            Proto.INS_CHALLENGE -> {
                val lc = if (apdu.size > 5) apdu[4].toInt() and 0xFF else 0
                buffer = respond(String(apdu.copyOfRange(5, 5 + lc), Charsets.UTF_8))
                byteArrayOf((buffer.size shr 8).toByte(), (buffer.size and 0xFF).toByte()) + Proto.SW_OK
            }
            Proto.INS_READ -> {
                val off = ((apdu[2].toInt() and 0xFF) shl 8) or (apdu[3].toInt() and 0xFF)
                if (off >= buffer.size) Proto.SW_OK
                else buffer.copyOfRange(off, minOf(buffer.size, off + Proto.CHUNK)) + Proto.SW_OK
            }
            else -> Proto.SW_UNKNOWN
        }
    }

    /** Signe "tid|code|machine" avec la cle du prochain jeton ; la cle est detruite. */
    private fun respond(text: String): ByteArray {
        val parts = text.split("|")
        if (parts.size != 2) return error("طلب غير صالح")
        val (challenge, machineId) = parts

        // Meme question repetee (contact interrompu) -> meme reponse : jamais 2 jetons pour 1 montee.
        if (challenge == lastChallenge) lastResponse?.let { return it }

        val t = store.nextActive() ?: run { onEvent("❌ لا توجد تذاكر في الهاتف"); return error("لا توجد تذاكر في الهاتف") }
        val der = try {
            signer.signOnce(t.alias, "${t.tid}|$challenge|$machineId".toByteArray(Charsets.UTF_8))
        } catch (e: Exception) {
            store.markBurned(t.tid)
            onEvent("❌ مفتاح التذكرة غير موجود")
            return error("مفتاح التذكرة غير موجود")
        }
        store.markBurned(t.tid)

        val resp = JSONObject().put("token", t.token).put("sig", Crypto.b64u(Crypto.derToRaw(der)))
            .toString().toByteArray(Charsets.UTF_8)
        lastChallenge = challenge
        lastResponse = resp
        onEvent("✅ تم استخدام تذكرة • المتبقي: ${store.activeCount()}")
        return resp
    }

    private fun error(msg: String): ByteArray = JSONObject().put("error", msg).toString().toByteArray(Charsets.UTF_8)
}
