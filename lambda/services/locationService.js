/**
 * locationService.js
 * Récupère la position de la box Alexa via Device Address API
 * puis convertit l'adresse en coordonnées GPS
 */

const Alexa = require('ask-sdk-core');
const https = require('https');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

/**
 * Tente de récupérer la position de la box Alexa
 * Retourne null si la permission n'est pas accordée
 */
async function getDeviceLocation(handlerInput) {
  const { serviceClientFactory, requestEnvelope } = handlerInput;
  
  try {
    const deviceId = requestEnvelope.context.System.device.deviceId;
    const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
    const address = await deviceAddressServiceClient.getFullAddress(deviceId);
    
    if (!address || (!address.city && !address.postalCode)) {
      return null;
    }
    
    // Construit une requête de géocodage depuis l'adresse
    const locationQuery = buildLocationQuery(address);
    return await geocodeAddress(locationQuery);
    
  } catch (error) {
    if (error.name === 'ServiceError' && error.statusCode === 403) {
      // Permission non accordée
      return { permissionRequired: true };
    }
    console.error('Erreur locationService:', error);
    return null;
  }
}

/**
 * Construit la requête de recherche depuis l'adresse Alexa
 */
function buildLocationQuery(address) {
  const parts = [];
  
  if (address.city) parts.push(address.city);
  else if (address.districtOrCounty) parts.push(address.districtOrCounty);
  
  if (address.stateOrRegion) parts.push(address.stateOrRegion);
  if (address.countryCode) parts.push(address.countryCode);
  else parts.push('FR');
  
  return parts.join(', ');
}

/**
 * Géocode une adresse en coordonnées GPS via OpenWeatherMap Geocoding API
 */
function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    const path = `/geo/1.0/direct?q=${encodeURIComponent(address)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    
    https.get({ hostname: 'api.openweathermap.org', path }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            resolve({
              lat: results[0].lat,
              lon: results[0].lon,
              name: results[0].name,
              country: results[0].country
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Vérifie si les permissions d'adresse sont accordées
 */
function hasAddressPermission(handlerInput) {
  const { requestEnvelope } = handlerInput;
  const permissions = requestEnvelope.context.System.user.permissions;
  return !!(permissions && permissions.consentToken);
}

/**
 * Construit le message de demande de permission
 */
function getPermissionCard() {
  return {
    type: 'AskForPermissionsConsent',
    permissions: ['read::alexa:device:all:address']
  };
}

module.exports = { getDeviceLocation, hasAddressPermission, getPermissionCard };
