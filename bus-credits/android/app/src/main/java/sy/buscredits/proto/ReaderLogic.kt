package sy.buscredits.proto

import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Cote MACHINE : dialogue NFC + verification 100 % hors-ligne.
 * Logique pure, sans Android : utilisee par MachineActivity et par les tests.
 */
object ReaderLogic {
    class Result(val ok: Boolean, val message: String, val tid: String? = null)

    /** Dialogue avec le telephone. Retourne la reponse JSON ({token, sig} ou {error}). */
    fun exchange(transceive: (ByteArray) -> ByteArray, challenge: String, machineId: String): JSONObject {
        if (!Proto.isOk(transceive(Proto.selectApdu()))) throw IllegalStateException("تطبيق رصيد الباص غير مثبت على هاتف الراكب")
        val r = transceive(Proto.challengeApdu("$challenge|$machineId"))
        if (!Proto.isOk(r) || r.size < 4) throw IllegalStateException("رد غير صالح من الهاتف")
        val total = ((r[0].toInt() and 0xFF) shl 8) or (r[1].toInt() and 0xFF)
        val out = ByteArrayOutputStream()
        while (out.size() < total) {
            val c = transceive(Proto.readApdu(out.size()))
            if (!Proto.isOk(c) || c.size <= 2) break
            out.write(c, 0, c.size - 2)
        }
        return JSONObject(String(out.toByteArray(), Charsets.UTF_8))
    }

    /**
     * 1) tampon officiel du serveur sur le jeton
     * 2) signature du telephone sur "tid|code|machine" avec la cle du jeton
     * 3) jeton pas deja vu sur cette machine
     */
    fun verify(serverKeyB64: String, machineId: String, challenge: String, token: String, sig: String, alreadySeen: (String) -> Boolean): Result {
        val parts = token.split(".")
        if (parts.size != 2) return Result(false, "تذكرة غير مقروءة")
        if (!Crypto.verify(Crypto.fromB64(serverKeyB64), parts[0].toByteArray(Charsets.US_ASCII), Crypto.fromB64(parts[1])))
            return Result(false, "تذكرة مزوّرة (الختم الرسمي غير صحيح)")
        val p = JSONObject(String(Crypto.fromB64(parts[0]), Charsets.UTF_8))
        val tid = p.getString("tid")
        val okPhone = Crypto.verify(Crypto.fromB64(p.getString("pub")),
            "$tid|$challenge|$machineId".toByteArray(Charsets.UTF_8), Crypto.fromB64(sig))
        if (!okPhone) return Result(false, "توقيع الهاتف غير صحيح")
        if (alreadySeen(tid)) return Result(false, "هذه التذكرة استُخدمت مسبقًا")
        return Result(true, "رحلة سعيدة ✅", tid)
    }
}
