# Prototype Android — jetons NFC hors-ligne

Une seule app, **deux modes** :
- **راكب (passager)** : achète des jetons en ligne. Chaque jeton = une clé créée dans la
  **puce de sécurité** du téléphone (Android Keystore), utilisable **une seule fois**
  (`setMaxUsageCount(1)` sur Android 12+). Le téléphone se comporte ensuite comme une
  **carte sans contact** (HCE) : pas besoin d'ouvrir l'app ni d'internet pour monter.
- **جهاز الباص (machine)** : lit le téléphone du passager en NFC et vérifie le jeton
  **sans internet** (tampon officiel du serveur + signature du téléphone + liste locale).
  Internet sert seulement au dépôt : charger le tampon, et synchroniser pour payer la société.

## Matériel pour le test
- 2 téléphones **Android avec NFC** (Android 12+ recommandé pour le passager).
- Un ordinateur qui fait tourner le serveur, sur le **même WiFi** que les téléphones.

## Étapes
1. **Serveur** (sur le Mac) :
   ```bash
   cd geo && git pull && cd bus-credits
   npm install && npm run seed && npm start
   ipconfig getifaddr en0        # ex. 192.168.1.25
   ```
2. **Installer `bus-credits-prototype.apk`** sur les 2 téléphones
   (autoriser « installer des applications inconnues »).
3. **Téléphone machine** → « وضع جهاز الباص » :
   adresse `http://IP-du-Mac:4000` → « تحميل قائمة الباصات » → choisir un bus → « تحميل الختم الرسمي ».
   Ensuite on peut **couper le WiFi et les données**.
4. **Téléphone passager** → « وضع الراكب » : même adresse → دخول (0940000002 / 1234)
   → « شحن 350 » → « شراء دفتر 10 تذاكر ». Regarder le **diagnostic** (مكان المفاتيح / الحماية).
   Ensuite **couper le WiFi et les données**.
5. **NFC activé** sur les deux. Passager : téléphone **déverrouillé**, approcher **le dos**
   du téléphone du dos de la machine → la machine affiche **رحلة سعيدة ✅** et bipe.
6. **Synchro** : remettre internet sur la machine → « مزامنة السجل » →
   les trajets apparaissent dans l'espace transporteur (onglet المستحقات).

## À me renvoyer après le test
Pour chaque modèle de téléphone passager : la marque/le modèle, la version d'Android,
et les 2 lignes du diagnostic (« مكان المفاتيح » et « الحماية »). Elles disent si l'usage
unique est garanti **par la puce** (✅) ou seulement par l'app (⚠️).

## En cas de souci
- « تطبيق رصيد الباص غير مثبت على هاتف الراكب » : le NFC du passager n'a pas transmis à l'app.
  Vérifier NFC activé, téléphone déverrouillé, écran allumé ; essayer de bouger le téléphone
  (l'antenne NFC est souvent au centre ou en haut du dos).
- « تعذّر الاتصال بالخادم » : mauvaise adresse IP, ou téléphone pas sur le même WiFi.

## Compiler soi-même
```bash
cd bus-credits/android
./gradlew assembleDebug        # -> app/build/outputs/apk/debug/app-debug.apk
```

## Tests automatiques (sans téléphone)
Un faux téléphone et une fausse machine dialoguent en APDU avec de **vrais jetons** du serveur :
```bash
cd bus-credits && npm start &                       # serveur
node tools/interop-vectors.js make /tmp/v.json      # achète de vrais jetons
cd android && BC_VECTORS=/tmp/v.json BC_RECORDS=/tmp/r.json ./gradlew testDebugUnitTest
cd .. && node tools/interop-vectors.js sync /tmp/r.json   # le serveur accepte le journal Kotlin
```

## Pas encore fait (prototype)
- Vérification **côté serveur** de l'attestation Android (la chaîne est déjà envoyée).
- Tests sur de **vrais téléphones** (puce + NFC réel).
- iPhone (mode QR de secours).
- Serveur en ligne en HTTPS (le prototype autorise `http://` en local).
