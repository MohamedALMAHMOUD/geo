package sy.buscredits.proto

import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.WindowManager
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Machine du bus : lit le telephone du passager en NFC et verifie le jeton 100 % HORS-LIGNE.
 * Internet sert seulement 1) a charger le tampon officiel et la liste des bus (au depot),
 * 2) a synchroniser le journal pour payer les societes.
 */
class MachineActivity : BaseActivity() {
    private lateinit var server: EditText
    private lateinit var busSpinner: Spinner
    private lateinit var state: TextView
    private lateinit var screen: TextView
    private lateinit var logView: TextView
    private lateinit var msg: TextView
    private var buses = JSONArray()
    private var nfc: NfcAdapter? = null
    private val tone by lazy { try { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100) } catch (e: Exception) { null } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setupPage("📟 جهاز الباص")
        nfc = NfcAdapter.getDefaultAdapter(this)

        screen = text("", 26f, C.TEXT, bold = true).also { gravityCenter(it) }
        setIdle()
        msg = text("").also { it.visibility = android.view.View.GONE }

        card {
            text("الإعداد (مرة واحدة في المرآب، مع إنترنت)", 16f, bold = true)
            label("عنوان الخادم")
            server = input("http://192.168.1.20:4000", prefs.server, ltr = true)
            button("1) تحميل قائمة الباصات", C.BLUE) { loadBuses() }
            label("هذا الجهاز مركّب في الباص:")
            busSpinner = Spinner(this@MachineActivity).also { addView(it) }
            button("2) تحميل الختم الرسمي", C.BLUE) { loadKey() }
            state = text("", 14f, C.MUTED)
        }
        card {
            text("المزامنة (عند توفر الإنترنت)", 16f, bold = true)
            text("ترسل الرحلات المسجّلة إلى الخادم لدفع مستحقات الشركة. لا تؤثر على قبول التذاكر.", 13f, C.MUTED)
            button("مزامنة السجل") { sync() }
        }
        card {
            text("سجل الجهاز", 16f, bold = true)
            logView = text("", 13f, C.MUTED)
        }
        refresh()
    }

    override fun onResume() {
        super.onResume()
        val a = nfc
        when {
            a == null -> showResult(false, "هذا الهاتف لا يدعم NFC")
            !a.isEnabled -> {
                showResult(false, "NFC متوقف — اضغط لتشغيله")
                screen.setOnClickListener { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }
            }
            else -> a.enableReaderMode(this, { tag -> onTag(tag) },
                NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
                Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) })
        }
    }

    override fun onPause() {
        super.onPause()
        try { nfc?.disableReaderMode(this) } catch (_: Exception) {}
    }

    // ------------------------------------------------------------------ NFC
    /** Appele sur un fil d'arriere-plan quand un telephone est approche. AUCUN appel internet ici. */
    private fun onTag(tag: Tag) {
        val machineId = prefs.machineId
        val serverKey = prefs.serverKey
        if (machineId == null || serverKey == null) { ui(false, "الجهاز غير مُعدّ"); return }
        val iso = IsoDep.get(tag) ?: run { ui(false, "بطاقة غير مدعومة"); return }
        val challenge = Crypto.randomHex(8)   // code aleatoire neuf a chaque contact
        try {
            iso.connect(); iso.timeout = 3000
            val json = try {
                ReaderLogic.exchange({ iso.transceive(it) }, challenge, machineId)
            } catch (e: IllegalStateException) { ui(false, e.message ?: "خطأ"); return }
            if (json.has("error")) { ui(false, json.getString("error")); return }
            val token = json.getString("token"); val sig = json.getString("sig")
            val log = prefs.mlog
            val res = ReaderLogic.verify(serverKey, machineId, challenge, token, sig) { tid ->
                (0 until log.length()).any { log.getJSONObject(it).optString("tid") == tid }
            }
            if (res.ok) {
                log.put(JSONObject().put("tid", res.tid).put("token", token)
                    .put("challenge", challenge).put("sig", sig).put("at", Instant.now().toString()))
                prefs.mlog = log
            }
            ui(res.ok, res.message)
        } catch (e: Exception) {
            ui(false, "انقطع الاتصال — أعد تقريب الهاتف")
        } finally {
            try { iso.close() } catch (_: Exception) {}
        }
    }

    private fun ui(ok: Boolean, text: String) = runOnUiThread { showResult(ok, text); feedback(ok); refresh() }

    private fun feedback(ok: Boolean) {
        try { tone?.startTone(if (ok) ToneGenerator.TONE_PROP_ACK else ToneGenerator.TONE_SUP_ERROR, if (ok) 200 else 500) } catch (_: Exception) {}
        try {
            @Suppress("DEPRECATION")
            (getSystemService(VIBRATOR_SERVICE) as? Vibrator)?.vibrate(VibrationEffect.createOneShot(if (ok) 80L else 400L, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {}
        screen.postDelayed({ setIdle() }, 2500)
    }

    private fun showResult(ok: Boolean, text: String) {
        screen.text = if (ok) text else "❌\n$text"
        screen.background = rounded(if (ok) C.DARK_GREEN else C.DARK_RED, 16, if (ok) C.GREEN else C.RED)
        screen.setPadding(dp(12), dp(28), dp(12), dp(28))
    }

    private fun setIdle() {
        screen.text = "قرّب هاتفك هنا 📲"
        screen.background = rounded(C.INPUT, 16, C.BLUE)
        screen.setPadding(dp(12), dp(28), dp(12), dp(28))
    }

    // ------------------------------------------------------------------ Reglages + synchro (internet)
    private fun refresh() {
        val log = prefs.mlog
        val pending = log.length() - prefs.synced
        state.text = buildString {
            append("الباص: ").append(prefs.machineLabel.ifEmpty { "لم يُحدَّد" }).append('\n')
            append("الختم الرسمي: ").append(if (prefs.serverKey != null) "محمّل ✅ (يعمل بدون إنترنت)" else "غير محمّل ⚠️").append('\n')
            append("رحلات بانتظار المزامنة: ").append(pending)
        }
        val fmt = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault())
        val sb = StringBuilder()
        for (i in log.length() - 1 downTo maxOf(0, log.length() - 15)) {
            val r = log.getJSONObject(i)
            val time = try { fmt.format(Instant.parse(r.getString("at"))) } catch (e: Exception) { "" }
            sb.append("🟢 ").append(time).append(" — تذكرة …").append(r.getString("tid").takeLast(6))
                .append(if (i < prefs.synced) " (تمت المزامنة)" else " (بانتظار المزامنة)").append('\n')
        }
        logView.text = if (sb.isEmpty()) "لا توجد رحلات بعد" else sb.toString()
    }

    private fun loadBuses() {
        prefs.server = server.text.toString()
        background({
            buses = Api.call(prefs.server, "/sim/machines").getJSONArray("machines")
            "تم تحميل ${buses.length()} باصات ✅"
        }, msg) {
            val names = (0 until buses.length()).map { buses.getJSONObject(it).let { b -> "${b.getString("label")} — ${b.getString("lineName")}" } }
            busSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
            busSpinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: android.view.View?, pos: Int, id: Long) {
                    val b = buses.getJSONObject(pos)
                    if (prefs.machineId != b.getString("id")) { prefs.mlog = JSONArray(); prefs.synced = 0 }
                    prefs.machineId = b.getString("id"); prefs.machineLabel = names[pos]; refresh()
                }
                override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
            }
        }
    }

    private fun loadKey() {
        prefs.server = server.text.toString()
        background({
            prefs.serverKey = Api.call(prefs.server, "/tokens/pubkey").getString("publicKey")
            "تم حفظ الختم الرسمي في الجهاز ✅"
        }, msg) { refresh() }
    }

    private fun sync() {
        val id = prefs.machineId ?: run { message(msg, "اختر الباص أولًا", false); return }
        background({
            val log = prefs.mlog
            val start = prefs.synced
            if (start >= log.length()) return@background "لا شيء للمزامنة"
            val recs = JSONArray()
            for (i in start until log.length()) {
                val r = log.getJSONObject(i)
                recs.put(JSONObject().put("token", r.getString("token")).put("challenge", r.getString("challenge"))
                    .put("sig", r.getString("sig")).put("at", r.getString("at")))
            }
            val res = Api.call(prefs.server, "/machine/sync", "POST", JSONObject().put("machineId", id).put("records", recs))
            val results = res.getJSONArray("results")
            var ok = 0
            for (i in 0 until results.length()) if (results.getJSONObject(i).getString("status") != "rejected") ok++
            prefs.synced = log.length()
            "تمت مزامنة $ok رحلة ✅"
        }, msg) { refresh() }
    }
}
