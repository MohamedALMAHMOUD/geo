package sy.buscredits.proto

/**
 * Protocole NFC entre la machine (lecteur) et le telephone du passager (carte emulee).
 *
 *   1. SELECT AID                           -> 90 00
 *   2. CHALLENGE  80 10 00 00 Lc "code|machine"
 *        Le telephone signe avec la cle du prochain jeton (la cle est detruite)
 *        et prepare sa reponse JSON {token, sig}.  -> [longueur sur 2 octets] 90 00
 *   3. READ       80 12 P1 P2 00   (P1P2 = position)  -> morceau de la reponse + 90 00
 *
 * La reponse fait ~450 octets : on la lit par morceaux car beaucoup de lecteurs
 * ne gerent pas les APDU longues.
 */
object Proto {
    val AID: ByteArray = hex("F04255534352")
    const val INS_CHALLENGE: Byte = 0x10
    const val INS_READ: Byte = 0x12
    const val CHUNK = 240

    val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
    val SW_UNKNOWN = byteArrayOf(0x6D, 0x00)

    fun selectApdu(): ByteArray =
        byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, AID.size.toByte()) + AID + byteArrayOf(0x00)

    fun challengeApdu(text: String): ByteArray {
        val data = text.toByteArray(Charsets.UTF_8)
        return byteArrayOf(0x80.toByte(), INS_CHALLENGE, 0x00, 0x00, data.size.toByte()) + data + byteArrayOf(0x00)
    }

    fun readApdu(offset: Int): ByteArray =
        byteArrayOf(0x80.toByte(), INS_READ, (offset shr 8).toByte(), (offset and 0xFF).toByte(), 0x00)

    fun isOk(resp: ByteArray): Boolean =
        resp.size >= 2 && resp[resp.size - 2] == 0x90.toByte() && resp[resp.size - 1] == 0x00.toByte()

    fun hex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
