/**
 * tidesService.js
 * Récupère les données de marées via WorldTides API
 * API docs: https://www.worldtides.info/developer
 * 
 * Variables nécessaires :
 *   WORLDTIDES_API_KEY → votre clé API WorldTides (plan gratuit = 100 req/mois)
 * 
 * Alternative gratuite française : API SHOM
 *   https://services.data.shom.fr (utiliser tidesService_SHOM.js)
 */

const https = require('https');

const API_KEY = process.env.WORLDTIDES_API_KEY;
const BASE_URL = 'www.worldtides.info';

/**
 * Récupère les marées pour les prochaines 24h
 */
function getTides(lat, lon, locationName) {
  return new Promise((resolve, reject) => {
    // Récupère: extremes (PM/BM) + niveaux toutes les heures + datum
    const path = `/api/v3?extremes&heights&datum=LAT&lat=${lat}&lon=${lon}&key=${API_KEY}&days=1&timezone=Europe/Paris`;
    
    https.get({ hostname: BASE_URL, path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          
          resolve(parseTideData(result, locationName));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Transforme les données brutes des marées
 */
function parseTideData(data, locationName) {
  const now = Date.now() / 1000; // timestamp actuel en secondes
  const extremes = data.extremes || [];
  
  // Trie et filtre les marées des 24h prochaines
  const upcomingTides = extremes
    .filter(e => e.dt >= now - 3600) // inclut 1h passée pour contexte
    .slice(0, 6) // max 6 marées (3 cycles)
    .map(e => ({
      type: e.type === 'High' ? 'Pleine mer' : 'Basse mer',
      typeShort: e.type === 'High' ? 'PM' : 'BM',
      isHigh: e.type === 'High',
      time: formatTime(e.dt),
      height: parseFloat(e.height.toFixed(2)),
      isPast: e.dt < now
    }));
  
  // Prochain événement de marée
  const nextTide = upcomingTides.find(t => !t.isPast);
  
  // Calcule le coefficient de marée (approximation via amplitude)
  const todayHighTides = extremes.filter(e => {
    const date = new Date(e.dt * 1000);
    const today = new Date();
    return e.type === 'High' && 
           date.toDateString() === today.toDateString();
  });
  
  const coefficient = calculateCoefficient(data.extremes, data.station);
  
  // Phase actuelle (montante/descendante)
  const currentPhase = getCurrentPhase(extremes, now);
  
  return {
    locationName: data.station || locationName,
    upcomingTides,
    nextTide,
    coefficient,
    currentPhase,
    stationName: data.station,
    datumOffset: data.responseDatum
  };
}

/**
 * Calcule une approximation du coefficient de marée (0-120)
 * Basé sur l'amplitude de la marée vs amplitude moyenne océanique
 */
function calculateCoefficient(extremes, stationName) {
  if (!extremes || extremes.length < 2) return null;
  
  // Trouve la prochaine haute et basse mer
  const now = Date.now() / 1000;
  const today = extremes.filter(e => {
    const date = new Date(e.dt * 1000);
    const todayDate = new Date();
    return date.toDateString() === todayDate.toDateString();
  });
  
  const highTide = today.find(e => e.type === 'High');
  const lowTide = today.find(e => e.type === 'Low');
  
  if (!highTide || !lowTide) return null;
  
  // Amplitude en mètres
  const amplitude = highTide.height - lowTide.height;
  
  // Coefficients approximatifs selon les côtes françaises
  // Atlantique : vive-eau = ~5m → coeff 95-120, morte-eau = ~2m → coeff 20-45
  // Méditerranée : faibles marées, coeff toujours bas
  let coeff;
  if (amplitude < 0.3) {
    coeff = Math.round(10 + amplitude * 30);
  } else if (amplitude < 1.0) {
    coeff = Math.round(20 + amplitude * 25);
  } else if (amplitude < 2.5) {
    coeff = Math.round(30 + amplitude * 20);
  } else if (amplitude < 4.0) {
    coeff = Math.round(45 + (amplitude - 2.5) * 20);
  } else if (amplitude < 6.0) {
    coeff = Math.round(75 + (amplitude - 4.0) * 15);
  } else {
    coeff = Math.min(120, Math.round(105 + (amplitude - 6.0) * 10));
  }
  
  return {
    value: coeff,
    label: getCoeffLabel(coeff),
    amplitude: parseFloat(amplitude.toFixed(2))
  };
}

/**
 * Détermine si la marée est montante ou descendante
 */
function getCurrentPhase(extremes, now) {
  if (!extremes || extremes.length === 0) return 'inconnue';
  
  // Trouve les deux événements encadrant le moment actuel
  let previous = null;
  let next = null;
  
  for (let i = 0; i < extremes.length; i++) {
    if (extremes[i].dt <= now) {
      previous = extremes[i];
    } else {
      next = extremes[i];
      break;
    }
  }
  
  if (!previous || !next) return 'indéterminée';
  
  if (previous.type === 'Low' && next.type === 'High') return 'montante';
  if (previous.type === 'High' && next.type === 'Low') return 'descendante';
  return 'indéterminée';
}

/**
 * Libellé du coefficient de marée
 */
function getCoeffLabel(coeff) {
  if (coeff < 20) return 'très faible (eaux calmes)';
  if (coeff < 45) return 'de morte-eau';
  if (coeff < 70) return 'moyen';
  if (coeff < 95) return 'de vive-eau';
  return 'de vive-eau exceptionnelle';
}

/**
 * Formate un timestamp Unix en heure locale française
 */
function formatTime(unixTimestamp) {
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris'
  });
}

module.exports = { getTides };
