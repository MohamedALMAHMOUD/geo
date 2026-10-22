package fr.geosilence

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Place(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radius: Float
)

/** Stockage minimal des lieux dans les SharedPreferences (JSON). */
object PlaceStore {
    private const val PREFS = "places"
    private const val KEY = "list"

    fun all(ctx: Context): List<Place> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")
        val arr = JSONArray(raw)
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            Place(
                o.getString("id"), o.getString("name"),
                o.getDouble("lat"), o.getDouble("lon"), o.getDouble("radius").toFloat()
            )
        }
    }

    fun add(ctx: Context, place: Place) = save(ctx, all(ctx) + place)

    fun remove(ctx: Context, id: String) = save(ctx, all(ctx).filter { it.id != id })

    private fun save(ctx: Context, places: List<Place>) {
        val arr = JSONArray()
        places.forEach {
            arr.put(
                JSONObject().put("id", it.id).put("name", it.name)
                    .put("lat", it.latitude).put("lon", it.longitude).put("radius", it.radius.toDouble())
            )
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }
}
