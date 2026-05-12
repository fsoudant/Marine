/**
 * tidesService.js
 * Récupère les marées officielles SHOM via le service de vignettes,
 * GRATUIT et sans clé API.
 *
 * ─── DÉCOUVERTE ─────────────────────────────────────────────────────────────
 * URL : https://services.data.shom.fr/hdm/vignette/petite/{PORT}?locale=fr
 *
 * Ce endpoint est conçu pour générer une petite iframe embarquable sur
 * n'importe quel site. Il retourne du JavaScript contenant les prochaines
 * marées au format ifrm.document.write('...HTML...').
 * On en extrait directement les données avec une regex — propre et fiable.
 *
 * ─── CE QU'ON OBTIENT ────────────────────────────────────────────────────────
 *   • Type        : PM (Pleine Mer) ou BM (Basse Mer)
 *   • Heure       : HH:MM en heure légale française (hiver/été inclus)
 *   • Hauteur     : en mètres (zéro hydrographique)
 *   • Coefficient : officiel SHOM pour Manche/Atlantique, '---' pour Médit.
 *
 * ─── PORTS ───────────────────────────────────────────────────────────────────
 * Le nom du port doit correspondre exactement au code SHOM.
 * Exemples : BREST, ROYAN, SAINT-MALO, LA_ROCHELLE, BAYONNE...
 * Liste complète : https://maree.shom.fr/vignette
 *
 * ─── AVANTAGES vs SPM payant ─────────────────────────────────────────────────
 *   ✅ Gratuit, sans clé, sans limite documentée
 *   ✅ Données officielles SHOM (mêmes prédictions que l'annuaire)
 *   ✅ Coefficients officiels inclus
 *   ✅ Heure légale française gérée nativement
 *   ✅ Aucune dépendance externe (pas d'@xmldom/xmldom)
 */

const https = require('https');

const SHOM_VIGNETTE_HOST = 'services.data.shom.fr';

// ─── Correspondance nom vocal → code port SHOM ───────────────────────────────
// Le code SHOM est celui utilisé dans l'URL de la vignette.
// Liste complète : https://maree.shom.fr/vignette (choisir un port → voir l'URL)
const PORT_CODES = {
  // Atlantique Nord
  'brest':             'BREST',
  'saint-malo':        'SAINT-MALO',
  'cherbourg':         'CHERBOURG',
  'le havre':          'LE_HAVRE',
  'rouen':             'ROUEN',
  'calais':            'CALAIS',
  'dunkerque':         'DUNKERQUE',
  'caen':              'CAEN',
  // Atlantique
  'lorient':           'LORIENT',
  'vannes':            'VANNES',
  'saint-nazaire':     'SAINT_NAZAIRE',
  'nantes':            'NANTES',
  'la rochelle':       'LA_ROCHELLE',
  'royan':             'ROYAN',
  'bordeaux':          'BORDEAUX',
  'arcachon':          'ARCACHON',
  'bayonne':           'BAYONNE',
  'biarritz':          'BIARRITZ',
  'saint-jean-de-luz': 'SAINT_JEAN_DE_LUZ',
  // Méditerranée
  'marseille':         'MARSEILLE',
  'toulon':            'TOULON',
  'nice':              'NICE',
  'monaco':            'MONACO',
  'sete':              'SETE',
  'port-vendres':      'PORT_VENDRES',
  // Corse
  'ajaccio':           'AJACCIO',
  'bastia':            'BASTIA',
};

// ─── Point d'entrée ───────────────────────────────────────────────────────────

/**
 * Récupère les marées SHOM pour un lieu donné.
 * @param {number}  lat           - Latitude (utilisée pour fallback)
 * @param {number}  lon           - Longitude (utilisée pour fallback)
 * @param {string}  locationName  - Nom du lieu (ex: "Royan", "Brest")
 */
async function getTides(lat, lon, locationName) {
  const portCode = resolvePortCode(locationName);

  if (!portCode) {
    // Port non trouvé dans le dictionnaire : on essaie quand même avec le
    // nom brut en majuscules (fonctionne pour beaucoup de ports SHOM)
    const fallbackCode = locationName.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
      .replace(/\s+/g, '_');
    return fetchShomVignette(fallbackCode, locationName);
  }

  return fetchShomVignette(portCode, locationName);
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

// ─── Parsing du JavaScript retourné ──────────────────────────────────────────

/**
 * Extrait les marées depuis la réponse JavaScript SHOM.
 *
 * Format des lignes utiles dans le stream :
 *   ifrm.document.write('   <tr >');
 *   ifrm.document.write('       <td>BM</td>');   ← ou PM
 *   ifrm.document.write('       <td>05:30</td>');
 *   ifrm.document.write('       <td>2.35</td>');
 *   ifrm.document.write('       <td>---</td>');  ← coeff (--- si Médit.)
 *
 * Stratégie : on extrait tout le texte visible des <td> et on regroupe
 * les blocs de 4 valeurs consécutives (type, heure, hauteur, coefficient).
 */
function parseVignetteResponse(jsText, locationName) {
  // Extrait toutes les valeurs entre balises <td>...</td>
  // Le regex capture aussi le cas "<td>\n   BM\n</td>" (avec espaces/sauts)
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const values = [];
  let match;

  while ((match = tdRegex.exec(jsText)) !== null) {
    const val = match[1].trim();
    if (val) values.push(val);
  }

  // Regroupe en blocs : [type, heure, hauteur, coeff]
  // On ignore les lignes d'en-tête (Heure, Hauteur, Coeff.)
  const HEADERS = new Set(['heure', 'hauteur', 'coeff.', 'coefficients', '']);
  const dataValues = values.filter(v => !HEADERS.has(v.toLowerCase()));

  const tides = [];
  for (let i = 0; i + 3 < dataValues.length; i += 4) {
    const type   = dataValues[i].trim();     // 'PM' ou 'BM'
    const heure  = dataValues[i + 1].trim(); // '05:30'
    const hauteur = parseFloat(dataValues[i + 2]);
    const coeffRaw = dataValues[i + 3].trim(); // '35' ou '---'

    if (type !== 'PM' && type !== 'BM') continue;
    if (isNaN(hauteur)) continue;

    const coeff = (coeffRaw === '---' || coeffRaw === '') ? null : parseInt(coeffRaw);

    tides.push({
      type:      type === 'PM' ? 'Pleine mer' : 'Basse mer',
      typeShort: type,
      isHigh:    type === 'PM',
      time:      heure,
      height:    hauteur,
      coefficient: coeff,
      isPast:    isTidePast(heure),
    });
  }

  if (tides.length === 0) {
    throw new Error(`Aucune marée extraite pour ${locationName} (code: vignette vide ?)`);
  }

  // Prochain événement de marée (non passé)
  const nextTide = tides.find(t => !t.isPast) || tides[0];

  // Coefficient officiel : celui de la prochaine pleine mer
  const nextPM = tides.find(t => t.isHigh && t.coefficient !== null);
  const coeffValue = nextPM?.coefficient ?? null;

  // Amplitude pour estimation si pas de coefficient (ex: Méditerranée)
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

  // Phase actuelle (montante/descendante) basée sur l'ordre des marées
  const currentPhase = determineCurrentPhase(tides);

  return {
    locationName,
    upcomingTides: tides,
    nextTide,
    coefficient,
    currentPhase,
    source: 'SHOM (officiel, gratuit)',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Détermine si une marée exprimée en "HH:MM" est déjà passée.
 */
function isTidePast(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const tideDate = new Date();
  tideDate.setHours(h, m, 0, 0);
  return tideDate < now;
}

/**
 * Déduit la phase actuelle (montante/descendante) depuis la liste des marées.
 * La vignette retourne les marées dans l'ordre chronologique.
 * Si la dernière passée est une BM → montante. Si PM → descendante.
 */
function determineCurrentPhase(tides) {
  const past = tides.filter(t => t.isPast);
  if (past.length === 0) {
    // Toutes futures : on regarde la première
    return tides[0]?.isHigh ? 'descendante' : 'montante';
  }
  const lastPast = past[past.length - 1];
  return lastPast.isHigh ? 'descendante' : 'montante';
}

/**
 * Résout le code port SHOM depuis le nom vocal (insensible à la casse et aux accents).
 */
function resolvePortCode(locationName) {
  if (!locationName) return null;
  const key = locationName.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return PORT_CODES[key] || null;
}

/**
 * Estime le coefficient (0-120) depuis l'amplitude en mètres.
 * Utilisé pour les ports méditerranéens où SHOM renvoie '---'.
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

module.exports = { getTides };
