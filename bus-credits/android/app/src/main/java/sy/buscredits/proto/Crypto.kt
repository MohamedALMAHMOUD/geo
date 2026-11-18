package sy.buscredits.proto

import java.security.KeyFactory
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * Outils crypto partages (Java pur : testables sur ordinateur).
 * Les signatures circulent au format "brut" r||s (64 octets, comme WebCrypto et le serveur).
 * Java/Android produit et attend du DER : on convertit dans les deux sens.
 */
object Crypto {
    fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    fun b64u(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    /** Decode du base64 standard OU base64url, avec ou sans "=". */
    fun fromB64(s: String): ByteArray {
        var t = s.trim().replace('-', '+').replace('_', '/')
        while (t.length % 4 != 0) t += "="
        return Base64.getDecoder().decode(t)
    }

    fun randomHex(n: Int): String {
        val b = ByteArray(n).also { SecureRandom().nextBytes(it) }
        return b.joinToString("") { "%02x".format(it) }
    }

    // ---- DER <-> brut (r||s) pour ECDSA P-256 ----
    fun derToRaw(der: ByteArray): ByteArray {
        var i = 2                                 // 0x30 len
        if (der[1].toInt() and 0x80 != 0) i += der[1].toInt() and 0x7F
        require(der[i].toInt() == 0x02); val rLen = der[i + 1].toInt(); val r = der.copyOfRange(i + 2, i + 2 + rLen)
        i += 2 + rLen
        require(der[i].toInt() == 0x02); val sLen = der[i + 1].toInt(); val s = der.copyOfRange(i + 2, i + 2 + sLen)
        return fixed32(r) + fixed32(s)
    }

    fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64)
        val r = derInt(raw.copyOfRange(0, 32)); val s = derInt(raw.copyOfRange(32, 64))
        val body = r + s
        return byteArrayOf(0x30, body.size.toByte()) + body
    }

    private fun fixed32(v: ByteArray): ByteArray {
        val t = v.dropWhile { it == 0.toByte() }.toByteArray()
        require(t.size <= 32)
        return ByteArray(32 - t.size) + t
    }

    private fun derInt(v: ByteArray): ByteArray {
        var t = v.dropWhile { it == 0.toByte() }.toByteArray()
        if (t.isEmpty()) t = byteArrayOf(0)
        if (t[0].toInt() and 0x80 != 0) t = byteArrayOf(0) + t
        return byteArrayOf(0x02, t.size.toByte()) + t
    }

    /** Verifie une signature brute (r||s) avec une cle publique X.509/SPKI. */
    fun verify(spki: ByteArray, data: ByteArray, rawSig: ByteArray): Boolean = try {
        val pub = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(spki))
        Signature.getInstance("SHA256withECDSA").run {
            initVerify(pub); update(data); verify(rawToDer(rawSig))
        }
    } catch (e: Exception) { false }
}
