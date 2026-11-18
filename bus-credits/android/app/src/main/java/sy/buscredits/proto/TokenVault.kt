package sy.buscredits.proto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * LE COFFRE-FORT : 1 jeton = 1 cle EC P-256 creee DANS la puce de securite du telephone
 * (Android Keystore : TEE ou StrongBox).
 *
 *  - La cle secrete ne peut jamais sortir de la puce (non exportable).
 *  - Android 12+ : setMaxUsageCount(1) -> la cle ne peut signer qu'UNE fois,
 *    puis elle est detruite. Sur Android < 12, on la supprime nous-memes (moins fort :
 *    le diagnostic l'affiche).
 *  - setUnlockedDeviceRequired : telephone deverrouille obligatoire.
 *  - Attestation : chaine de certificats prouvant au serveur ou vit la cle.
 */
object TokenVault {
    private const val KS = "AndroidKeyStore"

    class Created(val publicKey: ByteArray, val attestation: List<ByteArray>, val strongBox: Boolean)

    private fun ks(): KeyStore = KeyStore.getInstance(KS).apply { load(null) }

    fun create(alias: String): Created {
        val challenge = ByteArray(16).also { SecureRandom().nextBytes(it) }
        // On essaie dans cet ordre : StrongBox + attestation, TEE + attestation, TEE sans attestation.
        val attempts = listOf(true to true, false to true, false to false)
        var last: Exception? = null
        for ((strongBox, attest) in attempts) {
            if (strongBox && Build.VERSION.SDK_INT < 28) continue
            try {
                val b = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                if (Build.VERSION.SDK_INT >= 31) b.setMaxUsageCount(1)
                if (Build.VERSION.SDK_INT >= 28) {
                    b.setUnlockedDeviceRequired(true)
                    if (strongBox) b.setIsStrongBoxBacked(true)
                }
                if (attest) b.setAttestationChallenge(challenge)
                KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KS).run {
                    initialize(b.build()); generateKeyPair()
                }
                val store = ks()
                val chain = store.getCertificateChain(alias)?.map { it.encoded } ?: emptyList()
                return Created(store.getCertificate(alias).publicKey.encoded, if (attest) chain else emptyList(), strongBox)
            } catch (e: Exception) {
                last = e
                try { ks().deleteEntry(alias) } catch (_: Exception) {}
            }
        }
        throw last ?: IllegalStateException("Keystore indisponible")
    }

    /** Signe UNE fois puis la cle disparait. */
    fun signOnce(alias: String, data: ByteArray): ByteArray {
        val store = ks()
        val key = store.getKey(alias, null) as? PrivateKey ?: throw IllegalStateException("مفتاح التذكرة غير موجود")
        val sig = Signature.getInstance("SHA256withECDSA").run { initSign(key); update(data); sign() }
        // Android 12+ : deja detruite par la puce (usage unique). Avant : destruction logicielle.
        try { store.deleteEntry(alias) } catch (_: Exception) {}
        return sig
    }

    fun exists(alias: String): Boolean = try { ks().containsAlias(alias) } catch (e: Exception) { false }

    fun delete(alias: String) { try { ks().deleteEntry(alias) } catch (_: Exception) {} }

    /** Test de fraude : essayer de sortir la cle secrete. Retourne true si elle a pu sortir. */
    fun canExport(alias: String): Boolean = try {
        val key = ks().getKey(alias, null) as? PrivateKey
        key?.encoded != null
    } catch (e: Exception) { false }

    /** Diagnostic lisible : ou vit la cle, et l'usage unique est-il garanti par la puce ? */
    @Suppress("DEPRECATION")
    fun describe(alias: String): String = try {
        val key = ks().getKey(alias, null) as PrivateKey
        val info = KeyFactory.getInstance(key.algorithm, KS).getKeySpec(key, KeyInfo::class.java)
        val where = if (Build.VERSION.SDK_INT >= 31) when (info.securityLevel) {
            KeyProperties.SECURITY_LEVEL_STRONGBOX -> "شريحة StrongBox ✅"
            KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "شريحة آمنة TEE ✅"
            KeyProperties.SECURITY_LEVEL_SOFTWARE -> "برمجي ⚠️"
            else -> "غير معروف"
        } else if (info.isInsideSecureHardware) "شريحة آمنة ✅" else "برمجي ⚠️"
        val once = if (Build.VERSION.SDK_INT >= 31) {
            if (info.remainingUsageCount == 1) "استخدام واحد تفرضه الشريحة ✅" else "استخدام غير محدود ⚠️"
        } else "Android أقدم من 12: الحذف يتم من التطبيق ⚠️"
        "مكان المفاتيح: $where\nالحماية: $once\nإصدار Android: ${Build.VERSION.RELEASE}"
    } catch (e: Exception) { "تعذّر قراءة معلومات المفتاح: ${e.message}" }
}
