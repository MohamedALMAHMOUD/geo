package sy.buscredits.proto

import android.content.Context
import org.json.JSONArray

/** Stockage local (SharedPreferences). commit() pour que le service NFC lise une valeur a jour. */
class Prefs(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("bc", Context.MODE_PRIVATE)

    var server: String
        get() = p.getString("server", "http://192.168.1.20:4000")!!
        set(v) { p.edit().putString("server", v.trim().trimEnd('/')).commit() }

    // ---- passager ----
    var auth: String?
        get() = p.getString("auth", null)
        set(v) { p.edit().putString("auth", v).commit() }

    /** [{tid, alias, token, burned}] */
    var tokens: JSONArray
        get() = JSONArray(p.getString("tokens", "[]"))
        set(v) { p.edit().putString("tokens", v.toString()).commit() }

    var security: String
        get() = p.getString("security", "")!!
        set(v) { p.edit().putString("security", v).commit() }

    // ---- machine ----
    var machineId: String?
        get() = p.getString("machineId", null)
        set(v) { p.edit().putString("machineId", v).commit() }

    var machineLabel: String
        get() = p.getString("machineLabel", "")!!
        set(v) { p.edit().putString("machineLabel", v).commit() }

    /** Cle publique du serveur ("tampon officiel"), SPKI en base64 */
    var serverKey: String?
        get() = p.getString("serverKey", null)
        set(v) { p.edit().putString("serverKey", v).commit() }

    /** Journal des validations : [{tid, token, challenge, sig, at}] */
    var mlog: JSONArray
        get() = JSONArray(p.getString("mlog", "[]"))
        set(v) { p.edit().putString("mlog", v.toString()).commit() }

    var synced: Int
        get() = p.getInt("synced", 0)
        set(v) { p.edit().putInt("synced", v).commit() }

    fun activeTokens(): Int {
        val a = tokens; var n = 0
        for (i in 0 until a.length()) if (!a.getJSONObject(i).optBoolean("burned")) n++
        return n
    }
}
