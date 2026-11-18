package sy.buscredits.proto

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(msg: String) : Exception(msg)

/** Appels au serveur. Utilises uniquement pour : connexion, recharge, achat, chargement du tampon, synchro. */
object Api {
    fun call(base: String, path: String, method: String = "GET", body: JSONObject? = null, token: String? = null): JSONObject {
        val c = URL(base.trimEnd('/') + "/api" + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 8000
            c.readTimeout = 15000
            c.setRequestProperty("Content-Type", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
            if (code !in 200..299) throw ApiException(json.optString("error", "HTTP $code"))
            return json
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            throw ApiException("تعذّر الاتصال بالخادم ($base)")
        } finally {
            c.disconnect()
        }
    }
}
