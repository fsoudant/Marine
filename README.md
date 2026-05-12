# 🌊 Alexa Skill — Météo Marine & Marées (v3.0)

Skill Alexa entièrement **gratuite** : marées officielles SHOM sans clé API,
météo marine via OpenWeatherMap (plan gratuit).

---

## 💡 L'astuce SHOM — Vignette gratuite

Le SHOM expose un endpoint public destiné aux sites web pour afficher
une petite iframe de marées. Il retourne du JavaScript parsable contenant
les prochaines marées avec **coefficients officiels** — sans abonnement.

```
GET https://services.data.shom.fr/hdm/vignette/petite/{PORT}?locale=fr
```

**Ce qu'on obtient :**
- Type : PM (Pleine Mer) ou BM (Basse Mer)
- Heure en heure légale française (hiver/été géré nativement)
- Hauteur en mètres (zéro hydrographique SHOM)
- Coefficient officiel (Manche/Atlantique) ou `---` (Méditerranée)

**Exemple — Royan :**
```
BM  05:30  2.35m  ---
PM  12:20  4.12m  35
BM  18:08  2.52m  ---
```

---

## 🔑 Clés API nécessaires

### OpenWeatherMap (GRATUIT)
- Compte sur https://openweathermap.org/api
- Plan gratuit : 1 000 appels/jour
- Variable d'env Lambda : `OPENWEATHER_API_KEY`

### SHOM — Aucune clé !
Le service de vignette est public et gratuit.

---

## 🚀 Installation

### 1. Prérequis
```bash
npm install -g ask-cli
ask configure
```

### 2. Dépendances
```bash
cd lambda && npm install && cd ..
```

### 3. Créer la Lambda AWS
```bash
# Packager
cd lambda && zip -r ../skill.zip . && cd ..

# Créer la fonction (région EU recommandée pour les skills FR)
aws lambda create-function \
  --function-name meteo-marine-skill \
  --runtime nodejs18.x \
  --role arn:aws:iam::VOTRE_ID:role/lambda-alexa-role \
  --handler index.handler \
  --timeout 10 \
  --region eu-west-1 \
  --zip-file fileb://skill.zip

# Variable d'environnement
aws lambda update-function-configuration \
  --function-name meteo-marine-skill \
  --environment "Variables={OPENWEATHER_API_KEY=VOTRE_CLE_OWM}" \
  --region eu-west-1
```

### 4. Mettre à jour skill.json
Remplacez `VOTRE_ACCOUNT_ID` par votre vrai ID de compte AWS.

### 5. Déployer la skill
```bash
ask deploy
```

### 6. Autoriser l'adresse de la box
App Alexa → Appareils → Echo → Adresse → Renseignez-la.
Puis : Compétences → Météo Marine → Autorisations → Adresse complète.

---

## 🎤 Exemples de commandes

```
"Alexa, ouvre Météo Marine"
"Alexa, demande à Météo Marine la météo à Brest"
"Alexa, demande à Météo Marine les marées à Royan"
"Alexa, demande à Météo Marine un bulletin complet à Saint-Malo"
"Alexa, demande à Météo Marine ma position"
```

---

## 🗺️ Ports disponibles

Tous les ports du site https://maree.shom.fr sont supportés.
Le nom vocal est converti automatiquement en code SHOM.

Ports préconfigurés : Brest, Saint-Malo, Cherbourg, Le Havre, Rouen,
Calais, Dunkerque, Caen, Lorient, Vannes, Saint-Nazaire, Nantes,
La Rochelle, Royan, Bordeaux, Arcachon, Bayonne, Biarritz,
Saint-Jean-de-Luz, Marseille, Toulon, Nice, Monaco, Sète, Ajaccio, Bastia.

Pour ajouter un port, ajoutez-le dans `PORT_CODES` de `tidesService.js`.

---

## 🏗️ Architecture

```
Alexa ──▶ AWS Lambda
               ├── weatherService.js ──▶ OpenWeatherMap (clé gratuite)
               ├── tidesService.js   ──▶ SHOM vignette  (gratuit, sans clé)
               └── locationService.js ─▶ Alexa Device Address API
```

---

## 📁 Structure

```
alexa-meteo-marine/
├── skill.json
├── README.md
├── interactionModels/custom/fr-FR.json
└── lambda/
    ├── index.js
    ├── package.json                  ← 0 dépendance externe SHOM !
    └── services/
        ├── weatherService.js
        ├── tidesService.js           ← parse la vignette SHOM
        └── locationService.js
```

---

## 🐛 Dépannage

| Erreur | Cause | Solution |
|--------|-------|----------|
| `HTTP 404` vignette | Code port inconnu | Vérifier sur maree.shom.fr |
| `Aucune marée extraite` | Format vignette modifié par SHOM | Ouvrir une issue |
| `ServiceError 403` (Alexa) | Permission adresse non accordée | Voir Étape 6 |
| Timeout Lambda | APIs lentes | Timeout Lambda à 10s dans AWS Console |

---

## 📄 Licence

MIT — Données marées © SHOM (Licence Etalab 2.0).
Mention obligatoire si publication : *"Données marées © SHOM – Licence Etalab 2.0"*
