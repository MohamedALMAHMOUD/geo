package fr.geosilence

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class MainActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout
    private lateinit var status: TextView

    private val foregroundPerms = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { requestBackgroundIfNeeded() }

    private val backgroundPerm = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "GeoSilence"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }
        status = TextView(this).apply { textSize = 15f }
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        root.addView(status)
        root.addView(button("1. Autoriser « Ne pas déranger »") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
        })
        root.addView(button("2. Autoriser la localisation (toujours)") {
            foregroundPerms.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        })
        root.addView(button("3. Ajouter ma position actuelle comme lieu silencieux") { addCurrentPlace() })
        root.addView(list)

        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun button(label: String, onClick: () -> Unit) =
        Button(this).apply { text = label; setOnClickListener { onClick() } }

    private fun has(perm: String) =
        ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED

    private fun requestBackgroundIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            has(Manifest.permission.ACCESS_FINE_LOCATION) &&
            !has(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        ) {
            backgroundPerm.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else refresh()
    }

    private fun backgroundOk() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || has(Manifest.permission.ACCESS_BACKGROUND_LOCATION)

    @SuppressLint("MissingPermission")
    private fun addCurrentPlace() {
        if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) {
            toast("Autorise d'abord la localisation (étape 2)."); return
        }
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc ->
                if (loc == null) { toast("Position introuvable, active le GPS."); return@addOnSuccessListener }
                askNameAndRadius(loc.latitude, loc.longitude)
            }
    }

    private fun askNameAndRadius(lat: Double, lon: Double) {
        val name = EditText(this).apply { hint = "Nom (ex. Bibliothèque)" }
        val radius = EditText(this).apply {
            hint = "Rayon en mètres"; setText("100"); inputType = InputType.TYPE_CLASS_NUMBER
        }
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(48, 16, 48, 0)
            addView(name); addView(radius)
        }
        AlertDialog.Builder(this)
            .setTitle("Nouveau lieu silencieux")
            .setView(box)
            .setPositiveButton("Ajouter") { _, _ ->
                val r = radius.text.toString().toFloatOrNull()?.coerceIn(50f, 2000f) ?: 100f
                val n = name.text.toString().ifBlank { "Lieu" }
                PlaceStore.add(this, Place(name = n, latitude = lat, longitude = lon, radius = r))
                GeofenceHelper.registerAll(this) { refresh() }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun refresh() {
        val places = PlaceStore.all(this)
        status.text = buildString {
            append(if (DndController.hasAccess(this@MainActivity)) "✅" else "❌").append(" Accès Ne pas déranger\n")
            append(if (has(Manifest.permission.ACCESS_FINE_LOCATION)) "✅" else "❌").append(" Localisation précise\n")
            append(if (backgroundOk() && has(Manifest.permission.ACCESS_FINE_LOCATION)) "✅" else "❌")
                .append(" Localisation en arrière-plan (choisir « Toujours »)\n")
        }
        list.removeAllViews()
        places.forEach { p ->
            list.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(TextView(context).apply {
                    text = "📍 ${p.name} (${p.radius.toInt()} m)"
                    textSize = 16f
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(Button(context).apply {
                    text = "Supprimer"
                    setOnClickListener {
                        PlaceStore.remove(context, p.id)
                        DndController.exit(context, p.id)
                        GeofenceHelper.registerAll(context) { refresh() }
                    }
                })
            })
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
