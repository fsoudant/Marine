/**
 * tidesService.js
 * Récupère les marées officielles SHOM via le service de vignettes,
 * GRATUIT et sans clé API.
 *
 * URL : https://services.data.shom.fr/hdm/vignette/petite/{PORT}?locale=fr
 *
 * La vignette retourne les prochaines marées à venir (jamais les passées),
 * y compris en fin de nuit (ex: à 23h37, elle retourne déjà les marées
 * du lendemain). Les marées reçues sont donc toujours dans le futur.
 */

const https = require('https');

const SHOM_VIGNETTE_HOST = 'services.data.shom.fr';

// ─── Ports SHOM avec coordonnées GPS ─────────────────────────────────────────
// Les coordonnées permettent à findNearestPort() de trouver le port SHOM
// le plus proche quand la box Alexa est dans une ville non-portuaire
// (ex: "Le Gua" → Royan, "Hendaye" → Saint-Jean-de-Luz).
const PORTS = {
  // Manche
  'dunkerque':         { code: 'DUNKERQUE',         lat: 51.035, lon:  2.377 },
  'calais':            { code: 'CALAIS',             lat: 50.967, lon:  1.850 },
  'boulogne':          { code: 'BOULOGNE',           lat: 50.727, lon:  1.614 },
  'dieppe':            { code: 'DIEPPE',             lat: 49.923, lon:  1.085 },
  'le havre':          { code: 'LE_HAVRE',           lat: 49.493, lon:  0.108 },
  'caen':              { code: 'CAEN',               lat: 49.183, lon: -0.350 },
  'cherbourg':         { code: 'CHERBOURG',          lat: 49.650, lon: -1.630 },
  // Atlantique Nord
  'saint-malo':        { code: 'SAINT-MALO',         lat: 48.649, lon: -2.026 },
  'brest':             { code: 'BREST',              lat: 48.390, lon: -4.486 },
  'lorient':           { code: 'LORIENT',            lat: 47.749, lon: -3.367 },
  'vannes':            { code: 'VANNES',             lat: 47.658, lon: -2.762 },
  'saint-nazaire':     { code: 'SAINT_NAZAIRE',      lat: 47.273, lon: -2.214 },
  'nantes':            { code: 'NANTES',             lat: 47.218, lon: -1.554 },
  'rouen':             { code: 'ROUEN',              lat: 49.443, lon:  1.099 },
  // Atlantique
  'la rochelle':       { code: 'LA_ROCHELLE',        lat: 46.160, lon: -1.151 },
  'royan':             { code: 'ROYAN',              lat: 45.622, lon: -1.031 },
  'bordeaux':          { code: 'BORDEAUX',           lat: 44.837, lon: -0.579 },
  'arcachon':          { code: 'ARCACHON',           lat: 44.660, lon: -1.168 },
  'bayonne':           { code: 'BAYONNE',            lat: 43.493, lon: -1.476 },
  'biarritz':          { code: 'BIARRITZ',           lat: 43.483, lon: -1.558 },
  'saint-jean-de-luz': { code: 'SAINT_JEAN_DE_LUZ', lat: 43.390, lon: -1.663 },
  // Méditerranée
  'sete':              { code: 'SETE',               lat: 43.407, lon:  3.693 },
  'port-vendres':      { code: 'PORT_VENDRES',       lat: 42.521, lon:  3.104 },
  'marseille':         { code: 'MARSEILLE',          lat: 43.296, lon:  5.370 },
  'toulon':            { code: 'TOULON',             lat: 43.124, lon:  5.928 },
  'nice':              { code: 'NICE',               lat: 43.696, lon:  7.266 },
  'monaco':            { code: 'MONACO',             lat: 43.738, lon:  7.406 },
  // Corse
  'ajaccio':           { code: 'AJACCIO',            lat: 41.919, lon:  8.738 },
  'bastia':            { code: 'BASTIA',             lat: 42.697, lon:  9.451 },
};

// ─── Point d'entrée ───────────────────────────────────────────────────────────

/**
 * Récupère les marées SHOM pour un lieu.
 * Résolution du port (par ordre de priorité) :
 *   1. Nom vocal → correspondance directe dans PORTS
 *   2. Coordonnées lat/lon → port SHOM le plus proche (pour la box Alexa)
 *   3. Tentative avec le nom brut en majuscules (ports moins courants)
 */
async function getTides(lat, lon, locationName) {
  // 1. Correspondance par nom
  const portByName = resolvePortByName(locationName);
  if (portByName) {
    return fetchShomVignette(portByName.code, locationName);
  }

  // 2. Port le plus proche via les coordonnées GPS
  if (lat !== undefined && lon !== undefined) {
    const nearest = findNearestPort(lat, lon);
    if (nearest) {
      console.log(`Port le plus proche de "${locationName}" → ${nearest.code} (${nearest.distance} km)`);
      return fetchShomVignette(nearest.code, nearest.name);
    }
  }

  // 3. Tentative avec le nom brut converti en code SHOM
  const fallbackCode = locationName.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return fetchShomVignette(fallbackCode, locationName);
}

// ─── Appel HTTP SHOM vignette ─────────────────────────────────────────────────

function fetchShomVignette(portCode, locationName) {
  return new Promise((resolve, reject) => {
    const path = `/hdm/vignette/petite/${portCode}?locale=fr`;

    https.get({ hostname: SHOM_VIGNETTE_HOST, path }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`SHOM vignette HTTP ${res.statusCode} pour ${portCode}`));
            return;
          }
          resolve(parseVignetteResponse(raw, locationName));
        } catch (e) {
          reject(new Error(`Parsing SHOM vignette échoué : ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// ─── Parsing de la réponse JavaScript SHOM ───────────────────────────────────

/**
 * La vignette SHOM retourne toujours les prochaines marées à venir.
 * Elles sont donc toutes dans le futur → isPast est toujours false.
 * La première marée du tableau est la prochaine.
 *
 * Format extrait (blocs de 4 <td>) : type / heure / hauteur / coefficient
 */
function parseVignetteResponse(jsText, locationName) {
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const values = [];
  let match;

  while ((match = tdRegex.exec(jsText)) !== null) {
    const val = match[1].trim();
    if (val) values.push(val);
  }

  // Filtre les en-têtes du tableau
  const HEADERS = new Set(['heure', 'hauteur', 'coeff.', 'coefficients', '']);
  const dataValues = values.filter(v => !HEADERS.has(v.toLowerCase()));

  const tides = [];
  for (let i = 0; i + 3 < dataValues.length; i += 4) {
    const type     = dataValues[i].trim();
    const heure    = dataValues[i + 1].trim();
    const hauteur  = parseFloat(dataValues[i + 2]);
    const coeffRaw = dataValues[i + 3].trim();

    if (type !== 'PM' && type !== 'BM') continue;
    if (isNaN(hauteur)) continue;

    const coeff = (coeffRaw === '---' || coeffRaw === '') ? null : parseInt(coeffRaw);

    tides.push({
      type:         type === 'PM' ? 'Pleine mer' : 'Basse mer',
      typeShort:    type,
      isHigh:       type === 'PM',
      time:         heure,
      height:       hauteur,
      coefficient:  coeff,
      isPast:       false,       // La vignette SHOM ne retourne que des marées futures
      minutesUntil: minutesUntilTide(heure),
    });
  }

  if (tides.length === 0) {
    throw new Error(`Aucune marée extraite pour ${locationName}`);
  }

  // La première marée du tableau est toujours la prochaine
  const nextTide = tides[0];

  // Coefficient officiel de la prochaine PM (absent pour la Méditerranée)
  const nextPM    = tides.find(t => t.isHigh && t.coefficient !== null);
  const coeffValue = nextPM?.coefficient ?? null;

  // Amplitude (PM - BM) pour estimer le coefficient des ports sans coeff SHOM
  const pm = tides.find(t => t.isHigh);
  const bm = tides.find(t => !t.isHigh);
  const amplitude = pm && bm
    ? parseFloat((pm.height - bm.height).toFixed(2))
    : null;

  const coefficient = coeffValue !== null
    ? { value: coeffValue, label: getCoeffLabel(coeffValue), amplitude, source: 'SHOM officiel' }
    : amplitude !== null
    ? { value: estimateCoeff(amplitude), label: getCoeffLabel(estimateCoeff(amplitude)), amplitude, source: 'estimé (Méditerranée)' }
    : null;

  // Phase : si la prochaine marée est une PM → mer montante, sinon descendante
  const currentPhase = tides[0].isHigh ? 'montante' : 'descendante';

  return {
    locationName,
    upcomingTides: tides,
    nextTide,
    coefficient,
    currentPhase,
    source: 'SHOM (officiel, gratuit)',
  };
}

// ─── Résolution du port ───────────────────────────────────────────────────────

/**
 * Correspondance nom vocal → port SHOM (insensible à la casse et aux accents).
 */
function resolvePortByName(locationName) {
  if (!locationName) return null;
  const key = locationName.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return PORTS[key] || null;
}

/**
 * Trouve le port SHOM le plus proche d'une position GPS via la formule
 * de Haversine. Retourne le port + distance en km.
 */
function findNearestPort(lat, lon) {
  let nearest = null;
  let minDistance = Infinity;

  for (const [name, port] of Object.entries(PORTS)) {
    const dist = haversineKm(lat, lon, port.lat, port.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = { ...port, name, distance: Math.round(dist) };
    }
  }

  return nearest;
}

/**
 * Distance orthodromique entre deux points GPS (formule de Haversine).
 * Retourne la distance en kilomètres.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Helpers durée ────────────────────────────────────────────────────────────

/**
 * Calcule le nombre de minutes entre maintenant et une marée exprimée en "HH:MM".
 * Gère correctement le passage minuit : si l'heure de la marée est inférieure
 * à l'heure actuelle, la marée est le lendemain.
 *
 * Exemples :
 *   - 23h37, marée à 02h41 → 184 minutes  (lendemain)
 *   - 10h15, marée à 14h30 → 255 minutes  (même jour)
 */
function minutesUntilTide(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const tideMinutes = h * 60 + m;

  // Si l'heure de la marée est dans le passé aujourd'hui → elle est demain
  const diff = tideMinutes >= nowMinutes
    ? tideMinutes - nowMinutes
    : 1440 - nowMinutes + tideMinutes; // 1440 = minutes dans une journée

  return diff;
}

/**
 * Formate une durée en minutes en texte parlé naturel (français).
 *
 * Exemples :
 *   184 → "dans 3 heures et 4 minutes"
 *   255 → "dans 4 heures et 15 minutes"
 *    45 → "dans 45 minutes"
 *    62 → "dans 1 heure et 2 minutes"
 *    60 → "dans 1 heure"
 */
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) return `dans ${m} minute${m > 1 ? 's' : ''}`;
  if (m === 0) return `dans ${h} heure${h > 1 ? 's' : ''}`;
  return `dans ${h} heure${h > 1 ? 's' : ''} et ${m} minute${m > 1 ? 's' : ''}`;
}

// ─── Helpers coefficient ──────────────────────────────────────────────────────

/**
 * Estime le coefficient (0-120) depuis l'amplitude en mètres.
 * Calibré sur les données côtes françaises Manche/Atlantique.
 * Utilisé uniquement pour les ports méditerranéens (coeff SHOM = '---').
 */
function estimateCoeff(amplitude) {
  if (amplitude < 0.3) return Math.round(10 + amplitude * 30);
  if (amplitude < 1.0) return Math.round(20 + amplitude * 25);
  if (amplitude < 2.5) return Math.round(30 + amplitude * 20);
  if (amplitude < 4.0) return Math.round(45 + (amplitude - 2.5) * 20);
  if (amplitude < 6.0) return Math.round(75 + (amplitude - 4.0) * 15);
  return Math.min(120, Math.round(105 + (amplitude - 6.0) * 10));
}

function getCoeffLabel(coeff) {
  if (coeff < 20) return 'très faible';
  if (coeff < 45) return 'de morte-eau';
  if (coeff < 70) return 'moyen';
  if (coeff < 95) return 'de vive-eau';
  return 'de vive-eau exceptionnelle';
}

module.exports = { getTides, formatDuration };
