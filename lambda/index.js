/**
 * index.js — Point d'entrée de la Lambda Alexa Skill "Météo Marine"
 *
 * Intents gérés :
 *   - LaunchRequest          → accueil + météo/marées position box
 *   - MeteoMarineIntent      → météo marine pour un lieu ou la box
 *   - MareeIntent            → marées pour un lieu ou la box
 *   - MeteoEtMareeIntent     → bulletin complet
 *   - MaPositionIntent       → force la détection de position
 *   - AMAZON.HelpIntent
 *   - AMAZON.StopIntent / CancelIntent
 */

const Alexa = require('ask-sdk-core');
const { geocodeCity, getMarineWeather, getWeatherForecast } = require('./services/weatherService');
const { getTides } = require('./services/tidesService');
const { getDeviceLocation, getPermissionCard } = require('./services/locationService');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Résout la localisation :
 * 1. Slot vocal fourni par l'utilisateur
 * 2. Position de la box Alexa (Device Address API)
 * 3. null si rien
 */
async function resolveLocation(handlerInput, locationSlot) {
  if (locationSlot && locationSlot.value) {
    const coords = await geocodeCity(locationSlot.value);
    return { ...coords, source: 'vocal' };
  }
  
  const deviceLoc = await getDeviceLocation(handlerInput);
  if (deviceLoc && !deviceLoc.permissionRequired) {
    return { ...deviceLoc, source: 'box' };
  }
  if (deviceLoc && deviceLoc.permissionRequired) {
    return { permissionRequired: true };
  }
  
  return null;
}

/**
 * Construit le bulletin météo marine en texte parlé (SSML)
 */
function buildWeatherSpeech(weather, location) {
  const b = weather.beaufort;
  const sea = weather.seaState;
  
  let speech = `<speak>`;
  speech += `Bulletin météo marine pour ${location}. `;
  speech += `<break time="300ms"/>`;
  
  // Conditions générales
  speech += `Ciel : ${weather.description}. `;
  speech += `Température : ${weather.temperature} degrés. `;
  speech += `<break time="200ms"/>`;
  
  // Vent
  speech += `Vent de ${weather.windDirection}, force ${b.force} Beaufort, soit ${weather.windSpeed} nœuds. `;
  speech += `${b.label}. `;
  
  if (weather.windGust) {
    speech += `Rafales jusqu'à ${weather.windGust} nœuds. `;
  }
  speech += `<break time="200ms"/>`;
  
  // État de la mer
  speech += `État de la mer : ${sea.label}, hauteur de vagues estimée ${sea.height}. `;
  speech += `<break time="200ms"/>`;
  
  // Visibilité
  if (weather.visibility !== null) {
    speech += `Visibilité : ${weather.visibility > 10 ? 'bonne, plus de 10' : weather.visibility} kilomètres. `;
  }
  
  // Pression
  speech += `Pression : ${weather.pressure} hectopascals. `;
  speech += `<break time="200ms"/>`;
  
  // Lever/coucher soleil
  if (weather.sunriseTime && weather.sunsetTime) {
    speech += `Lever du soleil à ${weather.sunriseTime}, coucher à ${weather.sunsetTime}. `;
  }
  
  speech += `</speak>`;
  return speech;
}

/**
 * Construit le bulletin des marées en texte parlé (SSML)
 */
function buildTidesSpeech(tides, location) {
  let speech = `<speak>`;
  speech += `Marées pour ${tides.locationName || location}. `;
  speech += `<break time="300ms"/>`;
  
  // Phase actuelle
  if (tides.currentPhase) {
    speech += `La mer est actuellement ${tides.currentPhase}. `;
  }
  
  // Coefficient
  if (tides.coefficient) {
    speech += `Coefficient de marée : ${tides.coefficient.value}, ${tides.coefficient.label}. `;
    speech += `Amplitude : ${tides.coefficient.amplitude} mètres. `;
  }
  speech += `<break time="200ms"/>`;
  
  // Prochaine marée
  if (tides.nextTide) {
    const next = tides.nextTide;
    speech += `Prochaine marée : ${next.type} à ${next.time}, hauteur ${next.height} mètres. `;
    speech += `<break time="200ms"/>`;
  }
  
  // Toutes les marées du jour
  const todayTides = tides.upcomingTides.filter(t => !t.isPast);
  if (todayTides.length > 0) {
    speech += `Horaires complets : `;
    todayTides.forEach(t => {
      speech += `${t.typeShort} à ${t.time}, ${t.height} mètres. `;
    });
  }
  
  speech += `</speak>`;
  return speech;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * LaunchRequest — Ouverture de la skill
 */
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const deviceLoc = await getDeviceLocation(handlerInput);
    
    if (deviceLoc && deviceLoc.permissionRequired) {
      return handlerInput.responseBuilder
        .speak('Bienvenue dans Météo Marine ! Pour vous donner les informations de votre zone, j\'ai besoin d\'accéder à l\'adresse de votre appareil. Veuillez autoriser l\'accès dans l\'application Alexa.')
        .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
        .getResponse();
    }
    
    if (deviceLoc) {
      // On a la position, on donne un résumé rapide
      try {
        const [weather, tides] = await Promise.all([
          getMarineWeather(deviceLoc.lat, deviceLoc.lon),
          getTides(deviceLoc.lat, deviceLoc.lon, deviceLoc.name)
        ]);
        
        const b = weather.beaufort;
        const next = tides.nextTide;
        
        let speech = `<speak>Bienvenue dans Météo Marine pour ${deviceLoc.name}. `;
        speech += `Actuellement : vent de ${weather.windDirection} force ${b.force}, ${b.label}. `;
        speech += `Mer ${weather.seaState.label.toLowerCase()}. `;
        if (next) speech += `Prochaine marée : ${next.type} à ${next.time}. `;
        speech += `<break time="300ms"/>Demandez la météo, les marées, ou un bulletin complet. </speak>`;
        
        return handlerInput.responseBuilder
          .speak(speech)
          .reprompt('<speak>Vous pouvez demander <emphasis>les marées</emphasis> ou la <emphasis>météo marine</emphasis> pour un lieu précis.</speak>')
          .getResponse();
      } catch (err) {
        console.error('Launch error:', err);
      }
    }
    
    const welcomeSpeech = '<speak>Bienvenue dans Météo Marine ! Vous pouvez me demander la météo marine ou les marées pour un port, par exemple : <emphasis>météo à Biarritz</emphasis>, ou <emphasis>marées à La Rochelle</emphasis>.</speak>';
    
    return handlerInput.responseBuilder
      .speak(welcomeSpeech)
      .reprompt('<speak>Quel port vous intéresse ?</speak>')
      .getResponse();
  }
};

/**
 * MeteoMarineIntent — Météo marine pour un lieu
 */
const MeteoMarineIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MeteoMarineIntent';
  },
  async handle(handlerInput) {
    const locationSlot = Alexa.getSlot(handlerInput.requestEnvelope, 'location');
    
    try {
      const location = await resolveLocation(handlerInput, locationSlot);
      
      if (!location) {
        return handlerInput.responseBuilder
          .speak('<speak>Je n\'ai pas trouvé ce lieu. Pouvez-vous préciser ? Par exemple : météo marine à Brest.</speak>')
          .reprompt('<speak>Quel port souhaitez-vous ?</speak>')
          .getResponse();
      }
      
      if (location.permissionRequired) {
        return handlerInput.responseBuilder
          .speak('<speak>Pour utiliser votre position automatiquement, autorisez l\'accès à l\'adresse dans l\'application Alexa. Vous pouvez aussi me donner un lieu, par exemple : météo à Saint-Malo.</speak>')
          .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
          .getResponse();
      }
      
      const weather = await getMarineWeather(location.lat, location.lon);
      const locationLabel = location.source === 'box' ? `votre position (${location.name})` : location.name;
      
      const speech = buildWeatherSpeech(weather, locationLabel);
      
      return handlerInput.responseBuilder
        .speak(speech)
        .withSimpleCard(
          `⚓ Météo Marine — ${location.name}`,
          `Vent : ${weather.windDirection} ${weather.windSpeed} nœuds (F${weather.beaufort.force})\n` +
          `Mer : ${weather.seaState.label}\n` +
          `Température : ${weather.temperature}°C\n` +
          `Pression : ${weather.pressure} hPa\n` +
          `Visibilité : ${weather.visibility ?? 'N/A'} km`
        )
        .getResponse();
        
    } catch (err) {
      console.error('MeteoMarine error:', err);
      return handlerInput.responseBuilder
        .speak('<speak>Désolé, je n\'ai pas pu obtenir la météo marine. Vérifiez le nom du port et réessayez.</speak>')
        .getResponse();
    }
  }
};

/**
 * MareeIntent — Marées pour un lieu
 */
const MareeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MareeIntent';
  },
  async handle(handlerInput) {
    const locationSlot = Alexa.getSlot(handlerInput.requestEnvelope, 'location');
    
    try {
      const location = await resolveLocation(handlerInput, locationSlot);
      
      if (!location) {
        return handlerInput.responseBuilder
          .speak('<speak>Quel port souhaitez-vous ? Par exemple : marées à Biarritz.</speak>')
          .reprompt('<speak>Quel port ?</speak>')
          .getResponse();
      }
      
      if (location.permissionRequired) {
        return handlerInput.responseBuilder
          .speak('<speak>Autorisez l\'accès à votre adresse dans l\'app Alexa, ou donnez-moi un lieu précis.</speak>')
          .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
          .getResponse();
      }
      
      const tides = await getTides(location.lat, location.lon, location.name);
      const locationLabel = location.source === 'box' ? `votre position (${location.name})` : location.name;
      
      const speech = buildTidesSpeech(tides, locationLabel);
      
      // Carte Alexa (affichée sur les écrans Echo Show)
      let cardText = `Phase actuelle : ${tides.currentPhase}\n`;
      if (tides.coefficient) {
        cardText += `Coefficient : ${tides.coefficient.value} (${tides.coefficient.label})\n`;
        cardText += `Amplitude : ${tides.coefficient.amplitude} m\n\n`;
      }
      tides.upcomingTides.filter(t => !t.isPast).forEach(t => {
        cardText += `${t.typeShort} ${t.time} → ${t.height} m\n`;
      });
      
      return handlerInput.responseBuilder
        .speak(speech)
        .withSimpleCard(`🌊 Marées — ${location.name}`, cardText)
        .getResponse();
        
    } catch (err) {
      console.error('Maree error:', err);
      return handlerInput.responseBuilder
        .speak('<speak>Désolé, je n\'ai pas pu obtenir les horaires de marées. Réessayez dans quelques instants.</speak>')
        .getResponse();
    }
  }
};

/**
 * MeteoEtMareeIntent — Bulletin complet météo + marées
 */
const MeteoEtMareeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MeteoEtMareeIntent';
  },
  async handle(handlerInput) {
    const locationSlot = Alexa.getSlot(handlerInput.requestEnvelope, 'location');
    
    try {
      const location = await resolveLocation(handlerInput, locationSlot);
      
      if (!location) {
        return handlerInput.responseBuilder
          .speak('<speak>Pour quel port souhaitez-vous un bulletin complet ?</speak>')
          .reprompt('<speak>Quel port ?</speak>')
          .getResponse();
      }
      
      if (location.permissionRequired) {
        return handlerInput.responseBuilder
          .speak('<speak>Autorisez l\'accès à votre adresse dans l\'app Alexa ou précisez un lieu.</speak>')
          .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
          .getResponse();
      }
      
      const [weather, tides] = await Promise.all([
        getMarineWeather(location.lat, location.lon),
        getTides(location.lat, location.lon, location.name)
      ]);
      
      const locationLabel = location.source === 'box' ? `votre position (${location.name})` : location.name;
      
      // Combine les deux bulletins
      let speech = `<speak>Bulletin complet pour ${locationLabel}. `;
      speech += `<break time="300ms"/>`;
      
      // Météo (abrégée)
      const b = weather.beaufort;
      speech += `Météo marine : ${weather.description}. `;
      speech += `Vent de ${weather.windDirection}, force ${b.force}, ${weather.windSpeed} nœuds. `;
      speech += `${b.label}. Mer ${weather.seaState.label.toLowerCase()}. `;
      if (weather.windGust) speech += `Rafales à ${weather.windGust} nœuds. `;
      speech += `<break time="400ms"/>`;
      
      // Marées
      speech += `Marées : la mer est ${tides.currentPhase}. `;
      if (tides.coefficient) {
        speech += `Coefficient ${tides.coefficient.value}, ${tides.coefficient.label}. `;
      }
      const nextTides = tides.upcomingTides.filter(t => !t.isPast).slice(0, 4);
      if (nextTides.length > 0) {
        speech += `Horaires : `;
        nextTides.forEach(t => {
          speech += `${t.typeShort} à ${t.time} hauteur ${t.height} mètres. `;
        });
      }
      
      speech += `</speak>`;
      
      return handlerInput.responseBuilder
        .speak(speech)
        .withSimpleCard(
          `⚓🌊 Bulletin Complet — ${location.name}`,
          `MÉTÉO MARINE\nVent : ${weather.windDirection} ${weather.windSpeed} nœuds (F${weather.beaufort.force})\n` +
          `Mer : ${weather.seaState.label}\nPression : ${weather.pressure} hPa\n\n` +
          `MARÉES\nPhase : ${tides.currentPhase}\n` +
          (tides.coefficient ? `Coefficient : ${tides.coefficient.value}\n` : '') +
          nextTides.map(t => `${t.typeShort} ${t.time} → ${t.height}m`).join('\n')
        )
        .getResponse();
        
    } catch (err) {
      console.error('MeteoEtMaree error:', err);
      return handlerInput.responseBuilder
        .speak('<speak>Désolé, une erreur est survenue. Réessayez dans quelques instants.</speak>')
        .getResponse();
    }
  }
};

/**
 * MaPositionIntent — Force la détection de la box
 */
const MaPositionIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MaPositionIntent';
  },
  async handle(handlerInput) {
    const deviceLoc = await getDeviceLocation(handlerInput);
    
    if (!deviceLoc) {
      return handlerInput.responseBuilder
        .speak('<speak>Je n\'arrive pas à détecter votre position. Vérifiez que l\'adresse est renseignée dans l\'application Alexa.</speak>')
        .getResponse();
    }
    
    if (deviceLoc.permissionRequired) {
      return handlerInput.responseBuilder
        .speak('<speak>Pour accéder à votre position, ouvrez l\'application Alexa, allez dans les paramètres de la skill Météo Marine et autorisez l\'accès à l\'adresse.</speak>')
        .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
        .getResponse();
    }
    
    // Lance un bulletin complet pour la position
    try {
      const [weather, tides] = await Promise.all([
        getMarineWeather(deviceLoc.lat, deviceLoc.lon),
        getTides(deviceLoc.lat, deviceLoc.lon, deviceLoc.name)
      ]);
      
      const b = weather.beaufort;
      const next = tides.nextTide;
      
      let speech = `<speak>Position détectée : ${deviceLoc.name}. `;
      speech += `Vent de ${weather.windDirection} force ${b.force}, ${b.label}. `;
      speech += `Mer ${weather.seaState.label.toLowerCase()}. `;
      if (next) speech += `Prochaine marée : ${next.type} à ${next.time}, ${next.height} mètres. `;
      speech += `</speak>`;
      
      return handlerInput.responseBuilder.speak(speech).getResponse();
      
    } catch (err) {
      return handlerInput.responseBuilder
        .speak(`<speak>Position trouvée : ${deviceLoc.name}. Mais je n'ai pas pu récupérer les données marines.</speak>`)
        .getResponse();
    }
  }
};

/**
 * HelpIntent
 */
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speech = `<speak>
      Météo Marine vous informe sur les conditions en mer et les horaires de marées.
      <break time="200ms"/>
      Vous pouvez dire :
      <break time="100ms"/>
      <emphasis>Météo marine à Brest</emphasis> pour les conditions météo.
      <break time="100ms"/>
      <emphasis>Marées à La Rochelle</emphasis> pour les horaires de marées.
      <break time="100ms"/>
      <emphasis>Bulletin complet à Biarritz</emphasis> pour tout en une fois.
      <break time="100ms"/>
      <emphasis>Ma position</emphasis> pour utiliser l'adresse de votre box Alexa.
      <break time="200ms"/>
      Que souhaitez-vous savoir ?
    </speak>`;
    
    return handlerInput.responseBuilder
      .speak(speech)
      .reprompt('<speak>Quel port souhaitez-vous ?</speak>')
      .getResponse();
  }
};

/**
 * StopIntent / CancelIntent
 */
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('<speak>Bonne navigation et beau temps ! Au revoir.</speak>')
      .getResponse();
  }
};

/**
 * SessionEndedRequestHandler
 */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session terminée:', JSON.stringify(handlerInput.requestEnvelope));
    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * Gestionnaire d'erreurs global
 */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Erreur:', error.message, error.stack);
    return handlerInput.responseBuilder
      .speak('<speak>Désolé, une erreur inattendue est survenue. Réessayez ou contactez le support.</speak>')
      .reprompt('<speak>Que puis-je faire pour vous ?</speak>')
      .getResponse();
  }
};

// ─── Export Lambda Handler ───────────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    MeteoMarineIntentHandler,
    MareeIntentHandler,
    MeteoEtMareeIntentHandler,
    MaPositionIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
