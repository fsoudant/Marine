# ⛵ Cap Météo — Alexa Skill

Skill Alexa en français pour les marins et plaisanciers français.
Météo marine, marées officielles SHOM et bulletin voile en un mot.

> 💡 Ce projet a été entièrement développé avec l'assistance de
> [Claude](https://claude.ai) (Anthropic) — de l'architecture initiale
> jusqu'à la certification Alexa, en passant par le débogage et
> l'optimisation du code.

---

## 🎤 Utilisation

| Phrase | Résultat |
|--------|----------|
| `Alexa, ouvre Cap Météo` | Bulletin automatique basé sur l'adresse de ta box |
| `Alexa, demande à Cap Météo la météo à Biarritz` | Conditions marines complètes |
| `Alexa, demande à Cap Météo les marées à La Rochelle` | Horaires SHOM officiels + coefficients |
| `Alexa, demande à Cap Météo le bulletin complet à Brest` | Météo + toutes les marées du jour |
| `Alexa, demande à Cap Météo info navigation à Royan` | Bulletin voile : météo + prochaine marée |

---

## ✨ Fonctionnalités

- **Météo marine** : vent (direction, force Beaufort, nœuds, rafales),
  état de la mer, visibilité, pression, température, lever/coucher du soleil
- **Marées officielles SHOM** : horaires pleine/basse mer, coefficient,
  amplitude, phase actuelle, durée avant la prochaine marée
- **Bulletin voile** : résumé rapide météo + prochaine marée pour les sorties
- **163 ports français** : de Dunkerque à Monaco, Manche, Atlantique,
  Méditerranée et Corse
- **Détection automatique** : utilise l'adresse de ta box Alexa

---

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Echo     │───▶│  Alexa Skill     │───▶│  AWS Lambda     │
│   Alexa     │◀───│  Service         │◀───│  Node.js 22.x   │
└─────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                   ┌─────────────────────────────────┼──────────────────────┐
                   ▼                                 ▼                      ▼
      ┌──────────────────┐               ┌──────────────────┐  ┌──────────────────┐
      │ OpenWeatherMap   │               │  SHOM officiel   │  │  Alexa Device    │
      │  (météo marine)  │               │    (marées)      │  │  Address API     │
      └──────────────────┘               └──────────────────┘  └──────────────────┘
```

---

## 📋 Prérequis

| Outil | Version | Lien |
|-------|---------|------|
| Node.js | ≥ 22 | https://nodejs.org |
| ASK CLI | ≥ 2.x | `npm install -g ask-cli` |
| AWS CLI | ≥ 2.x | https://aws.amazon.com/cli |
| Compte Amazon Developer | — | https://developer.amazon.com |
| Compte AWS | — | https://aws.amazon.com |

---

## 🔑 Clés API nécessaires

### OpenWeatherMap (gratuit)

- Créez un compte sur https://openweathermap.org/api
- Plan **Free** suffisant : 1000 appels/jour
- Activez : **Current Weather Data** + **Geocoding API**

### SHOM (gratuit, sans clé !)

- Les marées utilisent le service de vignettes SHOM
- Aucune clé API requise
- Données officielles françaises
- 163 ports métropolitains supportés

---

## 🚀 Installation

### 1. Cloner le repo

```bash
git clone https://github.com/fsoudant/Marine.git
cd Marine
```

### 2. Installer les dépendances

```bash
cd lambda && npm install && cd ..
```

### 3. Créer la fonction Lambda

```bash
aws lambda create-function \
  --function-name meteo-marine-skill \
  --runtime nodejs22.x \
  --role arn:aws:iam::VOTRE_ACCOUNT_ID:role/lambda-alexa-role \
  --handler index.handler \
  --region eu-west-3 \
  --zip-file fileb://skill.zip
```

### 4. Configurer les variables d'environnement

```bash
aws lambda update-function-configuration \
  --function-name meteo-marine-skill \
  --environment "Variables={OPENWEATHER_API_KEY=VOTRE_CLE}" \
  --region eu-west-3
```

### 5. Ajouter le trigger Alexa

```bash
aws lambda add-permission \
  --function-name meteo-marine-skill \
  --statement-id alexa-skill-trigger \
  --action lambda:InvokeFunction \
  --principal alexa-appkit.amazon.com \
  --region eu-west-3
```

### 6. Déployer la skill

```bash
ask deploy
```

---

## 📍 Activation de la géolocalisation

1. App Alexa → **Appareils** → ton Echo → **Adresse de l'appareil**
2. **Compétences** → **Cap Météo** → **Autorisations** → **Adresse complète**

---

## 📁 Structure du projet

```
Marine/
├── skill-package/
│   ├── skill.json                    ← Manifest Alexa
│   └── interactionModels/
│       └── custom/
│           └── fr-FR.json            ← Modèle vocal français
├── lambda/
│   ├── index.js                      ← Handlers Alexa
│   ├── package.json
│   └── services/
│       ├── weatherService.js         ← API OpenWeatherMap
│       ├── tidesService.js           ← API SHOM (163 ports)
│       └── locationService.js        ← Adresse box Alexa
├── privacy.html                      ← Politique de confidentialité
├── terms.html                        ← Conditions d'utilisation
└── README.md
```

---

## 🐛 Dépannage

| Erreur | Cause | Solution |
|--------|-------|----------|
| `ServiceError 403` | Permission adresse non accordée | Voir "Activation géolocalisation" |
| `Aucune marée extraite` | Port non reconnu | Vérifier orthographe dans la liste SHOM |
| `401 Unauthorized` | Clé OWM invalide | Attendre 2h après création |
| Timeout Lambda | Requêtes lentes | Augmenter timeout à 10s dans la console AWS |

---

## 🤝 Contribution

Les PR sont les bienvenues ! En particulier :

- Ajout de ports manquants dans `tidesService.js`
- Amélioration de la reconnaissance vocale
- Support d'autres langues

---

## 📄 Licence

MIT — Libre d'utilisation, modification et distribution.

---

*Développé avec ❤️ et [Claude](https://claude.ai) (Anthropic) —
Pour tous les marins qui demandent à leur box Alexa si la mer est bonne* ⛵🌊