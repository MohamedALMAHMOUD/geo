# Bus Credits — Recharge de crédits pour lignes de bus (Syrie)

Prototype : **API REST + 2 tableaux de bord web** (client et transporteur), avec
vérification des paiements **ChamCash simulée** (module isolé, remplaçable par la
vraie API plus tard).

## Modèle monétaire
- 1 **crédit** = 1 L.S. nouvelle = 100 L.S. anciennes
- Un **trajet** = 35 crédits par défaut (3 500 L.S. anciennes), configurable par ligne

## Démarrage
```bash
cd bus-credits
npm install
npm run seed     # crée des comptes de démo
npm start        # http://localhost:4000
```

### Comptes de démo (après `npm run seed`)
- **Transporteur** : tél `0930000001`, PIN `1234` → http://localhost:4000/transporteur.html
- **Client** : tél `0940000002`, PIN `1234` → http://localhost:4000/

## Parcours client
1. Choisir une ligne et un montant → **Demander la recharge** (génère une référence).
2. **Simuler le transfert ChamCash** (en réel : fait dans l'appli ChamCash).
3. **Vérifier & créditer** → le module ChamCash confirme, le solde est crédité.
4. **Valider un trajet** → débite le prix du trajet.

## Parcours transporteur
- Voir les recharges reçues, les **confirmer manuellement** si besoin, suivre les
  revenus et les transferts ChamCash « reçus ».

## Architecture
```
bus-credits/
├── server.js           Serveur Express (API + statique)
├── src/
│   ├── db.js           Stockage JSON (→ à remplacer par PostgreSQL)
│   ├── auth.js         Téléphone + PIN (scrypt), sessions par jeton
│   ├── chamcash.js     ⚠️ Module ChamCash SIMULÉ (seul fichier à remplacer pour le réel)
│   ├── routes.js       Tous les endpoints de l'API
│   └── seed.js         Données de démonstration
└── public/             Les deux dashboards (HTML/CSS/JS, sans framework)
```

## Passer en production (étapes suivantes)
1. **ChamCash réel** : réécrire `verifyTransfer()` dans `src/chamcash.js` pour
   appeler l'API officielle ChamCash avec vos clés développeur. Rien d'autre à changer.
2. **Base de données** : remplacer `src/db.js` par PostgreSQL (Prisma ou pg).
3. **Sécurité** : OTP par SMS, JWT signés, HTTPS, limitation de débit.
4. **Mobile** : emballer l'API dans une app React Native ou Flutter (Android + iOS),
   ou publier les dashboards en PWA.

## Application mobile (Expo React Native)
Voir `mobile/` (et `mobile/README.md`). Un seul code pour Android + iOS :
- 🔎 Recherche de ligne **d'un point à un autre** (saisie d'adresse → géocodage → lignes directes)
- ⭐ **Lignes favorites** (ajout/suppression)
- 💳 Rechargement ChamCash (simulé) + trajet
- 🧭 Bus proches dans les deux sens

Lancer : `cd mobile && npm install && npx expo install && npx expo start` (régler `src/config.js` sur l'URL du serveur).

## Recherche d'adresse (données Damas de démo)
Les lieux et tracés sont dans `src/places.js` (source unique). Le géocodage texte utilise un
petit gazetteer local (fiable hors ligne) ; à remplacer par un vrai géocodeur plus tard.

## Jetons hors-ligne (simulateur : `/sim.html`)
Validation **sans internet** ni sur le téléphone ni sur la machine :
1. Achat en ligne d'un carnet : le téléphone crée 1 clé secrète par trajet dans son coffre-fort
   (puce de sécurité ; WebCrypto non exportable dans le simulateur) et n'envoie que les clés publiques.
   Le serveur signe chaque jeton (« tampon officiel », `src/tokensign.js`, ECDSA P-256).
2. Dans le bus : la machine envoie un code aléatoire (NFC), le téléphone le signe avec la clé du jeton,
   puis la clé est détruite. La machine vérifie localement le tampon + la signature.
3. Au dépôt : `POST /api/machine/sync` re-vérifie chaque validation et paie la société.

En production : clés Android Keystore à usage unique (`setMaxUsageCount(1)`) + vérification de
l'attestation Android à l'achat (`/api/tokens/buy`, simulée ici).

## Endpoints principaux
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/register` `/api/auth/login` | — |
| GET | `/api/lines` | public |
| POST | `/api/recharge` | client |
| POST | `/api/recharge/:id/simulate-transfer` | client (démo) |
| POST | `/api/recharge/:id/verify` | client |
| POST | `/api/trip` | client |
| GET | `/api/transporteur/overview` | transporteur |
| POST | `/api/transporteur/recharge/:id/confirm` | transporteur |
| GET | `/api/geocode?q=` | public (adresse → coordonnées) |
| POST | `/api/search-routes` | public (from/to → lignes directes) |
| GET/POST/DELETE | `/api/favorites` | client (lignes favorites) |
| GET | `/api/buses/near?lat=&lng=` | public (bus proches, 2 sens) |
