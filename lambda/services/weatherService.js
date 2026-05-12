/**
 * weatherService.js
 * Récupère les données météo marines via OpenWeatherMap API
 * API docs: https://openweathermap.org/current
 * 
 * Variables nécessaires :
 *   OPENWEATHER_API_KEY  → votre clé API OpenWeatherMap (plan gratuit suffit)
 */

const https = require('https');

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'api.openweathermap.org';

/**
 * Récupère les coordonnées GPS d'une ville
 */
function geocodeCity(cityName) {
  return new Promise((resolve, reject) => {
    const path = `/geo/1.0/direct?q=${encodeURIComponent(cityName)},FR&limit=1&appid=${API_KEY}`;
    
    https.get({ hostname: BASE_URL, path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            resolve({ lat: results[0].lat, lon: results[0].lon, name: results[0].name });
          } else {
            reject(new Error(`Ville introuvable : ${cityName}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Récupère la météo marine actuelle pour des coordonnées données
 */
function getMarineWeather(lat, lon) {
  return new Promise((resolve, reject) => {
    const path = `/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=fr`;
    
    https.get({ hostname: BASE_URL, path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const weather = JSON.parse(data);
          resolve(parseWeatherData(weather));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Récupère les prévisions sur 24h (données supplémentaires)
 */
function getWeatherForecast(lat, lon) {
  return new Promise((resolve, reject) => {
    const path = `/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=fr&cnt=8`;
    
    https.get({ hostname: BASE_URL, path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const forecast = JSON.parse(data);
          resolve(parseForecastData(forecast));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Transforme les données brutes de l'API en objet exploitable
 */
function parseWeatherData(data) {
  const windSpeedKnots = (data.wind?.speed || 0) * 1.944; // m/s → nœuds
  const windGustKnots = data.wind?.gust ? data.wind.gust * 1.944 : null;
  
  return {
    description: data.weather?.[0]?.description || 'Indisponible',
    temperature: Math.round(data.main?.temp || 0),
    feelsLike: Math.round(data.main?.feels_like || 0),
    windSpeed: Math.round(windSpeedKnots),
    windGust: windGustKnots ? Math.round(windGustKnots) : null,
    windDirection: getWindDirection(data.wind?.deg || 0),
    windDegrees: data.wind?.deg || 0,
    humidity: data.main?.humidity || 0,
    pressure: data.main?.pressure || 1013,
    visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
    cloudCover: data.clouds?.all || 0,
    rain1h: data.rain?.['1h'] || 0,
    beaufort: getBeaufortScale(windSpeedKnots),
    seaState: getSeaState(windSpeedKnots),
    sunriseTime: formatTime(data.sys?.sunrise),
    sunsetTime: formatTime(data.sys?.sunset),
    cityName: data.name,
    timestamp: new Date()
  };
}

function parseForecastData(data) {
  if (!data.list || data.list.length === 0) return null;
  
  // Prend la prévision la plus forte en vent sur les 24h
  const maxWind = data.list.reduce((max, item) => {
    const knots = (item.wind?.speed || 0) * 1.944;
    return knots > max.knots ? { knots, item } : max;
  }, { knots: 0, item: data.list[0] });
  
  return {
    maxWindKnots: Math.round(maxWind.knots),
    maxWindDirection: getWindDirection(maxWind.item.wind?.deg || 0),
    nextRain: data.list.find(item => (item.rain?.['3h'] || 0) > 0)
  };
}

/**
 * Convertit les degrés en direction cardinale (française)
 */
function getWindDirection(degrees) {
  const dirs = ['Nord', 'Nord-Nord-Est', 'Nord-Est', 'Est-Nord-Est', 
                'Est', 'Est-Sud-Est', 'Sud-Est', 'Sud-Sud-Est',
                'Sud', 'Sud-Sud-Ouest', 'Sud-Ouest', 'Ouest-Sud-Ouest',
                'Ouest', 'Ouest-Nord-Ouest', 'Nord-Ouest', 'Nord-Nord-Ouest'];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}

/**
 * Calcule l'échelle de Beaufort à partir des nœuds
 */
function getBeaufortScale(knots) {
  if (knots < 1) return { force: 0, label: 'Calme' };
  if (knots < 4) return { force: 1, label: 'Très légère brise' };
  if (knots < 7) return { force: 2, label: 'Légère brise' };
  if (knots < 11) return { force: 3, label: 'Petite brise' };
  if (knots < 16) return { force: 4, label: 'Jolie brise' };
  if (knots < 22) return { force: 5, label: 'Bonne brise' };
  if (knots < 28) return { force: 6, label: 'Vent frais' };
  if (knots < 34) return { force: 7, label: 'Grand frais' };
  if (knots < 41) return { force: 8, label: 'Coup de vent' };
  if (knots < 48) return { force: 9, label: 'Fort coup de vent' };
  if (knots < 56) return { force: 10, label: 'Tempête' };
  if (knots < 64) return { force: 11, label: 'Violente tempête' };
  return { force: 12, label: 'Ouragan' };
}

/**
 * Estime l'état de la mer (hauteur vagues approximative)
 */
function getSeaState(knots) {
  if (knots < 1) return { label: 'Mer calme', height: '0' };
  if (knots < 4) return { label: 'Mer ridée', height: '0 à 0,1 m' };
  if (knots < 7) return { label: 'Mer peu agitée', height: '0,1 à 0,5 m' };
  if (knots < 11) return { label: 'Mer légèrement agitée', height: '0,5 à 1,25 m' };
  if (knots < 16) return { label: 'Mer agitée', height: '1,25 à 2,5 m' };
  if (knots < 22) return { label: 'Mer forte', height: '2,5 à 4 m' };
  if (knots < 28) return { label: 'Mer très forte', height: '4 à 6 m' };
  if (knots < 34) return { label: 'Mer grosse', height: '6 à 9 m' };
  if (knots < 41) return { label: 'Mer très grosse', height: '9 à 14 m' };
  return { label: 'Mer énorme', height: 'plus de 14 m' };
}

/**
 * Formate un timestamp Unix en heure locale française
 */
function formatTime(unixTimestamp) {
  if (!unixTimestamp) return null;
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

module.exports = { geocodeCity, getMarineWeather, getWeatherForecast };
