# 🌊 Alexa Skill — Météo Marine & Marées

Skill Alexa en français qui fournit :
- **Météo marine** : vent (direction, force Beaufort, nœuds, rafales), état de la mer, visibilité, pression, température
- **Marées** : horaires pleine/basse mer, coefficient, amplitude, phase actuelle (montante/descendante)
- **Bulletin complet** : les deux en un seul appel
- **Détection automatique** : utilise l'adresse de votre box Alexa si aucun lieu n'est précisé

---

## 📋 Prérequis

| Outil | Version | Lien |
|-------|---------|------|
| Node.js | ≥ 18 | https://nodejs.org |
| ASK CLI | ≥ 2.x | `npm install -g ask-cli` |
| AWS CLI | ≥ 2.x | https://aws.amazon.com/cli |
| Compte Amazon Developer | — | https://developer.amazon.com |
| Compte AWS | — | https://aws.amazon.com |

---

## 🔑 Clés API nécessaires

### 1. OpenWeatherMap (GRATUIT — plan Free)
- Créez un compte sur https://openweathermap.org/api
- Récupérez votre clé API dans votre profil
- Activez : **Current Weather Data** + **Geocoding API** (inclus dans le plan gratuit)
- Limite gratuite : 1000 appels/jour — largement suffisant pour une box Alexa

### 2. WorldTides (GRATUIT — 100 requêtes/mois)
- Créez un compte sur https://www.worldtides.info/developer
- Récupérez votre clé API
- 100 requêtes gratuites/mois (1 requête = 1 appel de marée)
- Pour plus : plan payant à partir de 10$/an

> **💡 Alternative française pour les marées** : L'API SHOM (Service Hydrographique et Océanographique de la Marine) est **100% gratuite** pour les ports français.
> URL : `https://services.data.shom.fr`
> Voir section "Alternative SHOM" en bas de ce fichier.

---

## 🚀 Installation et déploiement

### Étape 1 — Configurer l'ASK CLI

```bash
ask configure
# Suivez les instructions pour lier votre compte Amazon Developer et AWS
```

### Étape 2 — Installer les dépendances

```bash
cd lambda
npm install
cd ..
```

### Étape 3 — Créer la fonction Lambda AWS

```bash
# Créer la fonction sur AWS Lambda (région eu-west-1 = Europe Irlande, recommandée pour les skills FR)
aws lambda create-function \
  --function-name meteo-marine-skill \
  --runtime nodejs18.x \
  --role arn:aws:iam::VOTRE_ACCOUNT_ID:role/lambda-alexa-role \
  --handler index.handler \
  --region eu-west-1 \
  --zip-file fileb://skill.zip

# Ajouter les variables d'environnement (clés API)
aws lambda update-function-configuration \
  --function-name meteo-marine-skill \
  --environment "Variables={OPENWEATHER_API_KEY=VOTRE_CLE_OWM,WORLDTIDES_API_KEY=VOTRE_CLE_WORLDTIDES}" \
  --region eu-west-1
```

### Étape 4 — Créer le rôle IAM Lambda

Dans la console AWS IAM, créez un rôle avec la politique `AWSLambdaBasicExecutionRole`.

### Étape 5 — Mettre à jour skill.json

Remplacez `VOTRE_ACCOUNT_ID` dans `skill.json` par votre vrai ID de compte AWS.

```json
"uri": "arn:aws:lambda:eu-west-1:123456789012:function:meteo-marine-skill"
```

### Étape 6 — Déployer via ASK CLI

```bash
ask deploy
```

Cette commande déploie :
- Le modèle d'interaction (intents, slots)
- Les métadonnées de la skill
- Lie la Lambda existante

### Étape 7 — Tester la skill

```bash
# Test en ligne de commande
ask dialog --locale fr-FR

# Ou dans la console Alexa Developer
# https://developer.amazon.com → Test → Activez "Mode de test"
```

---

## 🎤 Exemples d'utilisation

```
"Alexa, ouvre Météo Marine"
→ Bulletin automatique basé sur l'adresse de la box

"Alexa, demande à Météo Marine la météo à Biarritz"
→ Conditions marines à Biarritz

"Alexa, demande à Météo Marine les marées à La Rochelle"
→ Horaires de marées pour La Rochelle

"Alexa, demande à Météo Marine un bulletin complet à Brest"
→ Météo + marées pour Brest

"Alexa, demande à Météo Marine ma position"
→ Force la détection via l'adresse de la box
```

---

## 📍 Activation de la géolocalisation automatique

Pour que la skill détecte automatiquement votre position :

1. Ouvrez l'**application Alexa** sur votre téléphone
2. Allez dans **Appareils** → sélectionnez votre Echo
3. **Paramètres de l'appareil** → **Adresse de l'appareil**
4. Renseignez votre adresse
5. Dans **Compétences et jeux** → trouvez **Météo Marine**
6. **Autorisations** → activez **Adresse complète de l'appareil**

---

## 🇫🇷 Alternative SHOM pour les marées françaises

L'API SHOM est gratuite et précise pour les ports français.
Remplacez `tidesService.js` par la version SHOM :

```javascript
// URL de l'API SHOM
const SHOM_URL = 'https://services.data.shom.fr/hdm/tides/nextTidesForNextDays';

// Ports disponibles : Brest, Cherbourg, Calais, Dunkerque, Rouen,
// Le Havre, Saint-Malo, La Rochelle, Bayonne, Marseille, etc.

function getShomTides(portName) {
  const url = `${SHOM_URL}?harborName=${encodeURIComponent(portName)}&duration=1&nbDays=1`;
  // ... requête HTTP
}
```

Liste complète des ports SHOM : https://services.data.shom.fr/hdm/tides/portlist

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Echo / Alexa   │────▶│  Alexa Skill Service  │────▶│  AWS Lambda         │
│  (box ou app)   │◀────│  (Amazon)             │◀────│  (votre code)       │
└─────────────────┘     └──────────────────────┘     └──────────┬──────────┘
                                                                  │
                                          ┌───────────────────────┼───────────────────────┐
                                          ▼                       ▼                       ▼
                               ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
                               │ OpenWeatherMap   │   │  WorldTides API  │   │  Alexa Device    │
                               │ (météo marine)   │   │  (marées)        │   │  Address API     │
                               └──────────────────┘   └──────────────────┘   └──────────────────┘
```

---

## 📁 Structure du projet

```
alexa-meteo-marine/
├── skill.json                          ← Manifest de la skill
├── interactionModels/
│   └── custom/
│       └── fr-FR.json                  ← Modèle vocal français
├── lambda/
│   ├── index.js                        ← Handlers Alexa (point d'entrée)
│   ├── package.json                    ← Dépendances Node.js
│   └── services/
│       ├── weatherService.js           ← API OpenWeatherMap
│       ├── tidesService.js             ← API WorldTides
│       └── locationService.js         ← Adresse box Alexa
└── README.md                           ← Ce fichier
```

---

## 🐛 Dépannage

| Erreur | Cause probable | Solution |
|--------|---------------|----------|
| `ServiceError 403` | Permission adresse non accordée | Voir "Activation géolocalisation" |
| `Ville introuvable` | Nom mal orthographié | Utilisez des noms de villes standards |
| `401 Unauthorized` (OWM) | Clé API invalide ou inactive | Attendez 2h après création de la clé |
| `402 Payment Required` (WorldTides) | Quota gratuit dépassé | Passez à un plan payant ou utilisez SHOM |
| Timeout Lambda | Requêtes API lentes | Augmentez le timeout Lambda à 10s |

---

## 📄 Licence

MIT — Libre d'utilisation, modification et distribution.
