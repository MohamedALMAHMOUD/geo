package sy.buscredits.proto

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Test
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec

/**
 * Faux telephone (CardLogic) + fausse machine (ReaderLogic) qui dialoguent en APDU,
 * avec de VRAIS jetons emis par le serveur Node. Seuls la puce Android et la radio NFC
 * sont remplacees (cles logicielles a usage unique, appel direct au lieu de l'antenne).
 */
class InteropTest {

    private class MemStore(private val list: List<StoredToken>) : TokenStore {
        val burned = mutableSetOf<String>()
        override fun nextActive() = list.firstOrNull { it.tid !in burned }
        override fun markBurned(tid: String) { burned += tid }
        override fun activeCount() = list.count { it.tid !in burned }
    }

    /** Cles a usage unique : supprimees des leur premiere signature (comme setMaxUsageCount(1)). */
    private class OneTimeKeys(keys: Map<String, PrivateKey>) : OneTimeSigner {
        private val keys = keys.toMutableMap()
        override fun signOnce(alias: String, data: ByteArray): ByteArray {
            val k = keys.remove(alias) ?: throw IllegalStateException("cle detruite")
            return Signature.getInstance("SHA256withECDSA").run { initSign(k); update(data); sign() }
        }
    }

    @Test
    fun derRawRoundTrip() {
        val kp = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        repeat(300) { i ->
            val data = "message-$i".toByteArray()
            val der = Signature.getInstance("SHA256withECDSA").run { initSign(kp.private); update(data); sign() }
            val raw = Crypto.derToRaw(der)
            assertEquals(64, raw.size)
            assertTrue("verif brute #$i", Crypto.verify(kp.public.encoded, data, raw))
            assertArrayEquals(raw, Crypto.derToRaw(Crypto.rawToDer(raw)))
        }
    }

    @Test
    fun offlineFlowWithRealServerTokens() {
        val path = System.getProperty("vectors")
        Assume.assumeTrue("BC_VECTORS non fourni", !path.isNullOrEmpty())
        val v = JSONObject(File(path!!).readText())
        val serverKey = v.getString("serverKey")
        val machineId = v.getString("machineId")
        val otherMachine = v.getString("otherMachineId")

        val toks = v.getJSONArray("tokens")
        val stored = mutableListOf<StoredToken>()
        val priv = mutableMapOf<String, PrivateKey>()
        for (i in 0 until toks.length()) {
            val t = toks.getJSONObject(i)
            stored += StoredToken(t.getString("tid"), "alias-$i", t.getString("token"))
            priv["alias-$i"] = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(Crypto.fromB64(t.getString("pkcs8"))))
        }
        val store = MemStore(stored)
        val signer = OneTimeKeys(priv)
        val phone = CardLogic(store, signer)

        val seen = mutableSetOf<String>()
        val records = JSONArray()

        fun tap(mId: String = machineId): Triple<ReaderLogic.Result, JSONObject, String> {
            val ch = Crypto.randomHex(8)
            val json = ReaderLogic.exchange({ phone.process(it) }, ch, mId)    // "NFC"
            val r = ReaderLogic.verify(serverKey, mId, ch, json.getString("token"), json.getString("sig")) { it in seen }
            if (r.ok) {
                seen += r.tid!!
                records.put(JSONObject().put("token", json.getString("token")).put("challenge", ch)
                    .put("sig", json.getString("sig")).put("at", java.time.Instant.now().toString()))
            }
            return Triple(r, json, ch)
        }

        // 1) Deux montees normales, hors-ligne
        val (r1, resp1, _) = tap()
        assertTrue("montee 1 : ${r1.message}", r1.ok)
        val (r2, _, _) = tap()
        assertTrue("montee 2 : ${r2.message}", r2.ok)
        assertEquals(stored.size - 2, store.activeCount())
        println("✅ 2 montees acceptees hors-ligne, jetons restants = ${store.activeCount()}")

        // 2) Rejouer l'echange de la montee 1 sur la meme machine (nouveau code)
        val rep = ReaderLogic.verify(serverKey, machineId, Crypto.randomHex(8), resp1.getString("token"), resp1.getString("sig")) { it in seen }
        assertFalse(rep.ok); println("🛡️ rejeu meme machine : ${rep.message}")

        // 3) Le complice presente l'echange dans un autre bus
        val other = ReaderLogic.verify(serverKey, otherMachine, Crypto.randomHex(8), resp1.getString("token"), resp1.getString("sig")) { false }
        assertFalse(other.ok); println("🛡️ autre bus : ${other.message}")

        // 4) Re-signer avec un jeton brule : la cle n'existe plus
        val burnedReuse = runCatching { signer.signOnce("alias-0", "x".toByteArray()) }
        assertTrue(burnedReuse.isFailure); println("🛡️ jeton brule : cle detruite")

        // 5) Jeton trafique (prix change) : tampon officiel invalide
        val parts = resp1.getString("token").split(".")
        val payload = JSONObject(String(Crypto.fromB64(parts[0]))).put("p", 0)
        val forged = Crypto.b64u(payload.toString().toByteArray()) + "." + parts[1]
        val fr = ReaderLogic.verify(serverKey, machineId, "abcd", forged, resp1.getString("sig")) { false }
        assertFalse(fr.ok); println("🛡️ jeton trafique : ${fr.message}")

        // 6) Contact interrompu : la machine repete la meme question -> 1 seul jeton brule
        val before = store.activeCount()
        val ch = Crypto.randomHex(8)
        val a = phone.process(Proto.challengeApdu("$ch|$machineId"))
        val b = phone.process(Proto.challengeApdu("$ch|$machineId"))
        assertArrayEquals(a, b)
        assertEquals(before - 1, store.activeCount()); println("✅ repetition de la meme question : 1 seul jeton utilise")

        // 7) Plus de jetons -> refus propre
        while (store.activeCount() > 0) tap()
        val empty = ReaderLogic.exchange({ phone.process(it) }, Crypto.randomHex(8), machineId)
        assertTrue(empty.has("error")); println("✅ carnet vide : ${empty.getString("error")}")

        // Journal de la machine -> le test Node le renvoie au serveur (/api/machine/sync)
        System.getProperty("records")?.takeIf { it.isNotEmpty() }?.let {
            File(it).writeText(JSONObject().put("machineId", machineId).put("records", records).toString())
            println("📝 ${records.length()} validations ecrites pour la synchro")
        }
    }
}
