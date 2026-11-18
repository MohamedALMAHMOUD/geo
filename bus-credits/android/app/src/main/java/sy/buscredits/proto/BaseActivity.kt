package sy.buscredits.proto

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.concurrent.thread

/** Petites briques d'interface (sans XML ni bibliotheque) : theme sombre, arabe, RTL. */
abstract class BaseActivity : Activity() {
    object C {
        val BG = Color.parseColor("#0F172A")
        val CARD = Color.parseColor("#1E293B")
        val TEXT = Color.parseColor("#E2E8F0")
        val MUTED = Color.parseColor("#94A3B8")
        val GREEN = Color.parseColor("#22C55E")
        val BLUE = Color.parseColor("#3B82F6")
        val RED = Color.parseColor("#EF4444")
        val AMBER = Color.parseColor("#F59E0B")
        val DARK_GREEN = Color.parseColor("#064E3B")
        val DARK_RED = Color.parseColor("#7F1D1D")
        val INPUT = Color.parseColor("#0B1220")
    }

    lateinit var root: LinearLayout
    val prefs by lazy { Prefs(this) }

    fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    fun rounded(color: Int, radius: Int = 14, stroke: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            setColor(color); cornerRadius = dp(radius).toFloat()
            if (stroke != null) setStroke(dp(1), stroke)
        }

    fun setupPage(title: String) {
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
        val scroll = ScrollView(this).apply { setBackgroundColor(C.BG); isFillViewport = true }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(20), dp(16), dp(40))
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        scroll.addView(root)
        setContentView(scroll)
        text(title, 24f, C.TEXT, bold = true)
    }

    fun card(build: LinearLayout.() -> Unit): LinearLayout {
        val c = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(C.CARD, stroke = Color.parseColor("#243049"))
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        root.addView(c, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
        c.build()
        return c
    }

    fun LinearLayout.label(t: String): TextView = TextView(this@BaseActivity).also {
        it.text = t; it.setTextColor(C.MUTED); it.textSize = 13f
        it.setPadding(0, dp(8), 0, dp(4)); it.textDirection = View.TEXT_DIRECTION_RTL
        addView(it)
    }

    fun LinearLayout.text(t: String, size: Float = 15f, color: Int = C.TEXT, bold: Boolean = false): TextView =
        TextView(this@BaseActivity).also {
            it.text = t; it.setTextColor(color); it.textSize = size
            if (bold) it.setTypeface(null, Typeface.BOLD)
            it.setPadding(0, dp(4), 0, dp(4)); it.textDirection = View.TEXT_DIRECTION_RTL
            addView(it)
        }

    fun text(t: String, size: Float = 15f, color: Int = C.TEXT, bold: Boolean = false): TextView = root.text(t, size, color, bold)

    fun LinearLayout.input(hint: String, value: String = "", number: Boolean = false, ltr: Boolean = false): EditText =
        EditText(this@BaseActivity).also {
            it.hint = hint; it.setText(value); it.setTextColor(C.TEXT); it.setHintTextColor(C.MUTED)
            it.background = rounded(C.INPUT, 10, Color.parseColor("#3B4A63"))
            it.setPadding(dp(12), dp(10), dp(12), dp(10)); it.isSingleLine = true
            if (number) it.inputType = InputType.TYPE_CLASS_NUMBER
            if (ltr) { it.textDirection = View.TEXT_DIRECTION_LTR; it.layoutDirection = View.LAYOUT_DIRECTION_LTR }
            addView(it, LinearLayout.LayoutParams(-1, -2))
        }

    fun LinearLayout.button(t: String, color: Int = C.GREEN, onClick: () -> Unit): Button =
        Button(this@BaseActivity).also {
            it.text = t; it.isAllCaps = false; it.textSize = 16f
            it.setTextColor(if (color == C.GREEN) Color.parseColor("#04210F") else Color.WHITE)
            it.setTypeface(null, Typeface.BOLD)
            it.background = rounded(color, 10)
            it.setOnClickListener { onClick() }
            addView(it, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(10) })
        }

    fun message(tv: TextView, msg: String, ok: Boolean) {
        tv.text = msg
        tv.setTextColor(if (ok) Color.parseColor("#A7F3D0") else Color.parseColor("#FECACA"))
        tv.background = rounded(if (ok) C.DARK_GREEN else C.DARK_RED, 10)
        tv.setPadding(dp(10), dp(8), dp(10), dp(8))
        tv.visibility = View.VISIBLE
    }

    /** Travail reseau en arriere-plan, resultat sur l'ecran. */
    fun background(work: () -> String, out: TextView, after: () -> Unit = {}) {
        thread {
            val (msg, ok) = try { work() to true } catch (e: Exception) { (e.message ?: "خطأ") to false }
            runOnUiThread { message(out, msg, ok); after() }
        }
    }

    fun gravityCenter(v: TextView) { v.gravity = Gravity.CENTER }

    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState) }
}
