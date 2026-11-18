package sy.buscredits.proto

import android.content.Intent
import android.nfc.NfcAdapter
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/** Ecran du passager : achat de jetons (en ligne) + coffre-fort + statut NFC. */
class PassengerActivity : BaseActivity() {
    private lateinit var server: EditText
    private lateinit var loginBox: LinearLayout
    private lateinit var appBox: LinearLayout
    private lateinit var phone: EditText
    private lateinit var pin: EditText
    private lateinit var wallet: TextView
    private lateinit var vault: TextView
    private lateinit var vaultIcons: TextView
    private lateinit var security: TextView
    private lateinit var nfcState: TextView
    private lateinit var live: TextView
    private lateinit var msg: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setupPage("👤 هاتف الراكب")

        live = text("", 20f, C.TEXT, bold = true).also { gravityCenter(it); it.visibility = View.GONE }
        msg = text("").also { it.visibility = View.GONE }

        card {
            label("عنوان الخادم")
            server = input("http://192.168.1.20:4000", prefs.server, ltr = true)
            button("حفظ العنوان", C.BLUE) { prefs.server = server.text.toString(); message(msg, "تم حفظ العنوان", true) }
        }

        loginBox = card {
            text("تسجيل الدخول", 17f, bold = true)
            label("رقم الهاتف"); phone = input("09xxxxxxxx", "0940000002", number = true, ltr = true)
            label("الرمز السري"); pin = input("••••", "1234", number = true, ltr = true)
            button("دخول") { login() }
        }

        appBox = card {
            wallet = text("المحفظة: —", 17f, bold = true)
            text("الشحن والشراء يحتاجان إنترنت. ركوب الباص لا يحتاج.", 13f, C.MUTED)
            button("شحن 350 (شام كاش - محاكاة)", C.BLUE) { recharge() }
            button("شراء دفتر 10 تذاكر (350)") { buy() }
        }

        card {
            vault = text("🔐 الخزنة: 0 تذكرة", 17f, bold = true)
            vaultIcons = text("", 20f)
            security = text("", 13f, C.MUTED)
            text("للركوب: افتح قفل الهاتف وقرّب ظهره من جهاز الباص. لا حاجة لفتح التطبيق ولا للإنترنت.", 14f, C.TEXT)
            nfcState = text("", 14f)
        }

        card {
            text("🕵️ اختبار احتيال", 17f, bold = true)
            button("محاولة إخراج مفتاح من الخزنة", C.AMBER) { tryExport() }
            button("حذف كل التذاكر (للتجربة)", C.RED) { resetVault() }
        }
    }

    override fun onResume() {
        super.onResume()
        TicketHceService.listener = { m ->
            live.text = m; live.visibility = View.VISIBLE
            live.background = rounded(if (m.startsWith("✅")) C.DARK_GREEN else C.DARK_RED, 12)
            live.setPadding(dp(12), dp(16), dp(12), dp(16))
            refresh()
        }
        refresh()
        refreshWallet()
    }

    override fun onPause() {
        super.onPause()
        TicketHceService.listener = null
    }

    private fun refresh() {
        val logged = prefs.auth != null
        loginBox.visibility = if (logged) View.GONE else View.VISIBLE
        appBox.visibility = if (logged) View.VISIBLE else View.GONE

        val arr = prefs.tokens
        val sb = StringBuilder()
        for (i in 0 until arr.length()) sb.append(if (arr.getJSONObject(i).optBoolean("burned")) "✖️" else "🔑")
        vault.text = "🔐 الخزنة: ${prefs.activeTokens()} تذكرة"
        vaultIcons.text = if (sb.isEmpty()) "فارغة — اشترِ دفترًا" else sb.toString()
        security.text = prefs.security

        val nfc = NfcAdapter.getDefaultAdapter(this)
        when {
            nfc == null -> { nfcState.text = "❌ هذا الهاتف لا يدعم NFC"; nfcState.setTextColor(C.RED) }
            !nfc.isEnabled -> {
                nfcState.text = "⚠️ NFC متوقف — اضغط هنا لتشغيله"; nfcState.setTextColor(C.AMBER)
                nfcState.setOnClickListener { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }
            }
            else -> { nfcState.text = "✅ NFC يعمل"; nfcState.setTextColor(C.GREEN) }
        }
    }

    private fun refreshWallet() {
        val auth = prefs.auth ?: return
        thread {
            try {
                val w = Api.call(prefs.server, "/wallet", token = auth)
                runOnUiThread { wallet.text = "المحفظة: ${w.getInt("balanceCredits")} كريدت" }
            } catch (_: Exception) { runOnUiThread { wallet.text = "المحفظة: — (بدون اتصال)" } }
        }
    }

    private fun login() {
        prefs.server = server.text.toString()
        background({
            val r = Api.call(prefs.server, "/auth/login", "POST",
                JSONObject().put("phone", phone.text.toString()).put("pin", pin.text.toString()))
            prefs.auth = r.getString("token")
            "تم الدخول ✅"
        }, msg) { refresh(); refreshWallet() }
    }

    private fun recharge() {
        val auth = prefs.auth ?: return
        background({
            val s = prefs.server
            val rc = Api.call(s, "/recharge", "POST", JSONObject().put("amountCredits", 350), auth)
            val id = rc.getJSONObject("recharge").getString("id")
            Api.call(s, "/recharge/$id/simulate-transfer", "POST", JSONObject(), auth)
            val v = Api.call(s, "/recharge/$id/verify", "POST", JSONObject(), auth)
            "تم شحن 350 ✅ الرصيد: ${v.getInt("balanceCredits")}"
        }, msg) { refreshWallet() }
    }

    /** Cree 10 cles dans la puce, envoie seulement les cles publiques, recoit 10 jetons tamponnes. */
    private fun buy() {
        val auth = prefs.auth ?: return
        background({
            val n = 10
            val base = "jt_" + System.currentTimeMillis()
            val aliases = (1..n).map { "${base}_$it" }
            val pubs = JSONArray(); val atts = JSONArray()
            try {
                for (a in aliases) {
                    val c = TokenVault.create(a)
                    pubs.put(Crypto.b64(c.publicKey))
                    atts.put(JSONArray(c.attestation.map { Crypto.b64(it) }))
                }
                val diag = TokenVault.describe(aliases[0])
                val r = Api.call(prefs.server, "/tokens/buy", "POST",
                    JSONObject().put("publicKeys", pubs).put("attestations", atts).put("security", diag), auth)
                val got = r.getJSONArray("tokens")
                val arr = prefs.tokens
                for (i in 0 until got.length()) {
                    val t = got.getJSONObject(i)
                    arr.put(JSONObject().put("tid", t.getString("tid")).put("alias", aliases[i])
                        .put("token", t.getString("token")).put("burned", false))
                }
                prefs.tokens = arr
                prefs.security = diag
                "تم وضع 10 تذاكر في خزنة الهاتف ✅ الرصيد: ${r.getInt("balanceCredits")}"
            } catch (e: Exception) {
                aliases.forEach { TokenVault.delete(it) }   // achat rate : on ne garde aucune cle
                throw e
            }
        }, msg) { refresh(); refreshWallet() }
    }

    private fun tryExport() {
        val arr = prefs.tokens
        var alias: String? = null
        for (i in 0 until arr.length()) if (!arr.getJSONObject(i).optBoolean("burned")) { alias = arr.getJSONObject(i).getString("alias"); break }
        if (alias == null) { message(msg, "لا توجد تذكرة للاختبار", false); return }
        if (TokenVault.canExport(alias)) message(msg, "⚠️ خرج المفتاح من الخزنة", false)
        else message(msg, "🛡️ مرفوض: المفتاح السري لا يمكنه الخروج من شريحة الهاتف", true)
    }

    private fun resetVault() {
        val arr = prefs.tokens
        for (i in 0 until arr.length()) TokenVault.delete(arr.getJSONObject(i).getString("alias"))
        prefs.tokens = JSONArray(); prefs.security = ""
        live.visibility = View.GONE
        message(msg, "تم حذف كل التذاكر", true); refresh()
    }
}
