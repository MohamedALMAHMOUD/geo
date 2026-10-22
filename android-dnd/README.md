# GeoSilence (Android)

Quand tu entres dans un lieu enregistré (bibliothèque, salle de classe, lieu de culte…),
le téléphone passe en **Ne pas déranger**. À la sortie, le réglage précédent est restauré.

## Lancer
1. Ouvrir le dossier `android-dnd/` dans Android Studio (Koala ou plus récent), laisser Gradle synchroniser.
2. Lancer sur un téléphone Android 8+ avec Google Play Services (l'émulateur marche aussi : *Extended controls → Location*).
3. Dans l'app : étape 1 (accès Ne pas déranger), étape 2 (localisation « Toujours »), étape 3 (ajouter le lieu où tu te trouves).

## Fonctionnement
- `GeofenceHelper` enregistre les lieux auprès de Google Play Services (géorepérage, faible consommation).
- `GeofenceReceiver` reçoit ENTRÉE/SORTIE → `DndController` change le filtre d'interruption.
- `BootReceiver` réinstalle les géorepérages après redémarrage.

## Limites
- Android uniquement. Sur iPhone : Raccourcis → Automatisation → Arrivée → Activer Ne pas déranger.
- Rayon minimum conseillé : 100 m (la précision des géorepérages est d'environ 100–150 m en intérieur).
- Pour laisser passer les favoris, remplacer `INTERRUPTION_FILTER_NONE` par `INTERRUPTION_FILTER_PRIORITY` dans `DndController`.
- Code non compilé dans cet environnement (pas de SDK Android) : à valider dans Android Studio.
