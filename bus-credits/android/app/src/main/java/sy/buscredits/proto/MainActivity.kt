package sy.buscredits.proto

import android.content.Intent
import android.os.Bundle

/** Accueil : la meme app sert de telephone passager OU de machine du bus. */
class MainActivity : BaseActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setupPage("🚌 رصيد الباص")
        text("نموذج تجريبي: الدفع بالهاتف عبر NFC بدون إنترنت", 14f, C.MUTED)

        card {
            text("👤 أنا راكب", 18f, bold = true)
            text("اشترِ تذاكر عبر الإنترنت، ثم قرّب هاتفك من جهاز الباص. لا حاجة للإنترنت داخل الباص.", 14f, C.MUTED)
            button("وضع الراكب") { startActivity(Intent(this@MainActivity, PassengerActivity::class.java)) }
        }
        card {
            text("📟 هذا الهاتف هو جهاز الباص", 18f, bold = true)
            text("يقرأ هواتف الركاب عبر NFC ويتحقق من التذاكر بدون إنترنت.", 14f, C.MUTED)
            button("وضع جهاز الباص", C.BLUE) { startActivity(Intent(this@MainActivity, MachineActivity::class.java)) }
        }
    }
}
