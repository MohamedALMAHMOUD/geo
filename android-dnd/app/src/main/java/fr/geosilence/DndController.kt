package fr.geosilence

import android.app.NotificationManager
import android.content.Context

/**
 * Active / restaure le mode Ne pas déranger.
 * Gère les lieux qui se chevauchent : on ne restaure le réglage d'origine
 * qu'en sortant du dernier lieu actif.
 */
object DndController {
    private const val PREFS = "dnd_state"
    private const val KEY_PREVIOUS = "previous_filter"
    private const val KEY_ACTIVE = "active_ids"

    fun hasAccess(ctx: Context): Boolean = manager(ctx).isNotificationPolicyAccessGranted

    @Synchronized
    fun enter(ctx: Context, placeId: String) {
        if (!hasAccess(ctx)) return
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val active = prefs.getStringSet(KEY_ACTIVE, emptySet())!!.toMutableSet()
        val nm = manager(ctx)
        if (active.isEmpty()) {
            prefs.edit().putInt(KEY_PREVIOUS, nm.currentInterruptionFilter).apply()
        }
        active.add(placeId)
        prefs.edit().putStringSet(KEY_ACTIVE, active).apply()
        // INTERRUPTION_FILTER_NONE = silence total ; remplacer par _PRIORITY pour laisser passer les favoris.
        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
    }

    @Synchronized
    fun exit(ctx: Context, placeId: String) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val active = prefs.getStringSet(KEY_ACTIVE, emptySet())!!.toMutableSet()
        if (!active.remove(placeId)) return
        prefs.edit().putStringSet(KEY_ACTIVE, active).apply()
        if (active.isEmpty() && hasAccess(ctx)) {
            val previous = prefs.getInt(KEY_PREVIOUS, NotificationManager.INTERRUPTION_FILTER_ALL)
            manager(ctx).setInterruptionFilter(previous)
        }
    }

    private fun manager(ctx: Context) =
        ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
