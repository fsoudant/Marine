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
  'laiguillon-sur-mer': { code: 'AIGUILLON_SUR_MER', lat: 46.334, lon: -1.308 },  // L'Aiguillon-sur-Mer
  'ajaccio': { code: 'AJACCIO', lat: 41.926, lon: 8.738 },  // Ajaccio
  'alpha-baie de seine': { code: 'ALPHA-BAIE_DE_SEINE', lat: 40.667, lon: -75.157 },  // Alpha-Baie de Seine
  'le havre-antifer terminal petrolier': { code: 'ANTIFER', lat: 49.494, lon: 0.108 },  // Le Havre-Antifer (Terminal pétrolier)
  'arcachon': { code: 'ARCACHON_EYRAC', lat: 44.662, lon: -1.170 },  // Arcachon
  'arradon': { code: 'ARRADON', lat: 47.628, lon: -2.823 },  // Arradon
  'arromanches-les-bains': { code: 'ARROMANCHES-LES-BAINS', lat: 49.337, lon: -0.622 },  // Arromanches-les-Bains
  'audierne quai pelletan': { code: 'AUDIERNE', lat: 48.023, lon: -4.545 },  // Audierne (Quai Pelletan)
  'auray st-goustan': { code: 'AURAY_SAINT-GOUSTAN', lat: 47.666, lon: -2.983 },  // Auray (St-Goustan)
  'banyuls-sur-mer': { code: 'BANYULS', lat: 42.479, lon: 3.128 },  // Banyuls-sur-Mer
  'barfleur': { code: 'BARFLEUR', lat: 49.671, lon: -1.264 },  // Barfleur
  'bastia': { code: 'BASTIA', lat: 42.699, lon: 9.451 },  // Bastia
  'benodet': { code: 'BENODET', lat: 47.875, lon: -4.111 },  // Bénodet
  'binic': { code: 'BINIC', lat: 48.601, lon: -2.825 },  // Binic
  'biscarrosse': { code: 'BISCARROSSE', lat: 44.391, lon: -1.161 },  // Biscarrosse
  'bonifacio': { code: 'BONIFACIO', lat: 41.388, lon: 9.161 },  // Bonifacio
  'bordeaux': { code: 'BORDEAUX', lat: 44.841, lon: -0.580 },  // Bordeaux
  'boucau-bayonne': { code: 'BOUCAU-BAYONNE', lat: 43.524, lon: -1.486 },  // Boucau-Bayonne
  'bouee fromentine': { code: 'BOUEE_FROMENTINE', lat: 46.890, lon: -2.137 },  // Bouée Fromentine
  'boulogne-sur-mer': { code: 'BOULOGNE-SUR-MER', lat: 50.726, lon: 1.612 },  // Boulogne-sur-Mer
  'ile de brehat': { code: 'BREHAT_MEN_JOLIGUET', lat: 48.843, lon: -3.001 },  // Île de Bréhat
  'brehec': { code: 'BREHEC', lat: 48.727, lon: -2.949 },  // Brehec
  'brest': { code: 'BREST', lat: 48.391, lon: -4.486 },  // Brest
  'moulin blanc': { code: 'BREST_MOULIN-BLANC', lat: 48.397, lon: -4.421 },  // Moulin Blanc
  'brignogan-plage': { code: 'BRIGNOGAN', lat: 48.665, lon: -4.327 },  // Brignogan-Plage
  'calais': { code: 'CALAIS', lat: 50.952, lon: 1.854 },  // Calais
  'calvi': { code: 'CALVI', lat: 42.568, lon: 8.759 },  // Calvi
  'camaret-sur-mer': { code: 'CAMARET-SUR-MER', lat: 48.277, lon: -4.597 },  // Camaret-sur-Mer
  'cancale': { code: 'CANCALE', lat: 48.677, lon: -1.851 },  // Cancale
  'capbreton': { code: 'CAPBRETON', lat: 43.640, lon: -1.432 },  // Capbreton
  'cap ferret': { code: 'CAP_FERRET', lat: 44.795, lon: -1.147 },  // Cap Ferret
  'carteret': { code: 'CARTERET', lat: 40.577, lon: -74.228 },  // Carteret
  'cayeux-sur-mer': { code: 'CAYEUX-SUR-MER', lat: 50.179, lon: 1.493 },  // Cayeux-sur-Mer
  'centuri': { code: 'CENTURI', lat: 42.961, lon: 9.368 },  // Centuri
  'cherbourg': { code: 'CHERBOURG', lat: 49.643, lon: -1.625 },  // Cherbourg
  'concarneau': { code: 'CONCARNEAU', lat: 47.876, lon: -3.922 },  // Concarneau
  'cordouan': { code: 'CORDOUAN', lat: 48.396, lon: -0.603 },  // Cordouan
  'courseulles-sur-mer large': { code: 'COURSEULLES_LARGE', lat: 49.330, lon: -0.456 },  // Courseulles-sur-Mer (Large)
  'dahouet': { code: 'DAHOUET', lat: 48.579, lon: -2.564 },  // Dahouet
  'trouville-deauville': { code: 'DEAUVILLE', lat: 49.368, lon: 0.082 },  // Trouville-Deauville
  'dielette': { code: 'DIELETTE', lat: 49.550, lon: -1.859 },  // Diélette
  'dieppe': { code: 'DIEPPE', lat: 49.925, lon: 1.079 },  // Dieppe
  'dives-sur-mer': { code: 'DIVES-SUR-MER', lat: 49.287, lon: -0.100 },  // Dives-sur-Mer
  'douarnenez': { code: 'DOUARNENEZ', lat: 48.094, lon: -4.331 },  // Douarnenez
  'dunkerque': { code: 'DUNKERQUE', lat: 51.035, lon: 2.377 },  // Dunkerque
  'erquy': { code: 'ERQUY_PORT', lat: 48.629, lon: -2.464 },  // Erquy
  'port detel': { code: 'ETEL', lat: 47.658, lon: -3.197 },  // Port d'Étel
  'etretat': { code: 'ETRETAT', lat: 49.707, lon: 0.203 },  // Étretat
  'fecamp': { code: 'FECAMP', lat: 49.758, lon: 0.375 },  // Fécamp
  'fort boyard': { code: 'FORT-BOYARD', lat: 46.000, lon: -1.214 },  // Fort Boyard
  'fos-sur-mer': { code: 'FOS_SUR_MER', lat: 43.438, lon: 4.946 },  // Fos-sur-Mer
  'fromentine embarcadere': { code: 'FROMENTINE_EMBARCADERE', lat: 46.890, lon: -2.137 },  // Fromentine (embarcadère)
  'penfret iles de glenan': { code: 'GLENAN_PENFRET', lat: 47.718, lon: -3.956 },  // Penfret (Îles de Glénan)
  'goury': { code: 'GOURY', lat: 49.716, lon: -1.946 },  // Goury
  'grandcamp entree chenal de carentan': { code: 'GRANDCAMP', lat: 49.046, lon: 0.527 },  // Grandcamp (Entrée chenal de Carentan)
  'granville': { code: 'GRANVILLE_LE_COCALEU', lat: 48.838, lon: -1.596 },  // Granville
  'gravelines': { code: 'GRAVELINES', lat: 50.987, lon: 2.127 },  // Gravelines
  'hendaye': { code: 'HENDAYE', lat: 43.364, lon: -1.762 },  // Hendaye
  'herqueville': { code: 'HERQUEVILLE', lat: 49.243, lon: 1.262 },  // Herqueville
  'hoedic': { code: 'HOEDIC', lat: 47.339, lon: -2.880 },  // Hoëdic
  'houat': { code: 'HOUAT', lat: 47.390, lon: -2.955 },  // Houat
  'grande-ile iles chausey': { code: 'ILES_CHAUSEY', lat: 48.873, lon: -1.833 },  // Grande-Île (Îles Chausey)
  'iles saint-marcouf': { code: 'ILES_SAINT-MARCOUF', lat: 49.498, lon: -1.146 },  // Îles Saint-Marcouf
  'ile aux moines': { code: 'ILE_AUX_MOINES_ER_GORED', lat: 47.584, lon: -2.854 },  // Île aux Moines
  'ile de sein': { code: 'ILE_DE_SEIN_NORD', lat: 48.038, lon: -4.852 },  // Île de Sein
  'ile daix': { code: 'ILE_D_AIX', lat: 46.012, lon: -1.173 },  // Île d'Aix
  'ile-rousse': { code: 'ILE_ROUSSE', lat: 43.133, lon: 5.728 },  // Île-Rousse
  'lacanau': { code: 'LACANAU_LARGE', lat: 44.978, lon: -1.078 },  // Lacanau
  'laber ildut': { code: 'LANILDUT', lat: 48.473, lon: -4.754 },  // L'Aber Ildut
  'larmor-baden': { code: 'LARMOR-BADEN', lat: 47.587, lon: -2.895 },  // Larmor-Baden
  'la cotiniere': { code: 'LA_COTINIERE', lat: 45.916, lon: -1.331 },  // La Cotinière
  'la palmyre': { code: 'LA_PALMYRE', lat: 45.691, lon: -1.178 },  // La Palmyre
  'la rochelle - la pallice': { code: 'LA_ROCHELLE-PALLICE', lat: 46.160, lon: -1.152 },  // La Rochelle - La Pallice
  'la trinite-sur-mer': { code: 'LA_TRINITE-SUR-MER', lat: 47.586, lon: -3.029 },  // La Trinité-sur-Mer
  'lesconil': { code: 'LESCONIL', lat: 47.798, lon: -4.214 },  // Lesconil
  'les ardentes': { code: 'LES_ARDENTES', lat: 46.321, lon: 2.951 },  // Les Ardentes
  'les heaux-de-brehat': { code: 'LES_HEAUX-DE-BREHAT', lat: 48.908, lon: -3.086 },  // Les Héaux-de-Bréhat
  'les sables dolonne': { code: 'LES_SABLES-D_OLONNE', lat: 46.500, lon: -1.793 },  // Les Sables d'Olonne
  'lezardrieux': { code: 'LEZARDRIEUX_PORT', lat: 48.787, lon: -3.106 },  // Lézardrieux
  'le conquet': { code: 'LE_CONQUET', lat: 48.361, lon: -4.771 },  // Le Conquet
  'le croisic': { code: 'LE_CROISIC', lat: 47.293, lon: -2.509 },  // Le Croisic
  'le dellec': { code: 'LE_DELLEC', lat: 48.353, lon: -4.572 },  // Le Dellec
  'le guilvinec': { code: 'LE_GUILVINEC', lat: 47.800, lon: -4.286 },  // Le Guilvinec
  'le havre': { code: 'LE_HAVRE', lat: 49.494, lon: 0.108 },  // Le Havre
  'le legue bouee': { code: 'LE_LEGUE_BOUEE', lat: 48.524, lon: -2.748 },  // Le Légué (Bouée)
  'le logeo': { code: 'LE_LOGEO', lat: 47.547, lon: -2.848 },  // Le Logeo
  'le palais belle-ile': { code: 'LE_PALAIS', lat: 47.347, lon: -3.155 },  // Le Palais (Belle-Île)
  'le pouldu': { code: 'LE_POULDU', lat: 47.768, lon: -3.546 },  // Le Pouldu
  'le pouliguen': { code: 'LE_POULIGUEN', lat: 47.271, lon: -2.431 },  // Le Pouliguen
  'le senequet': { code: 'LE_SENEQUET', lat: 49.091, lon: -1.662 },  // Le Sénéquet
  'le touquet-etaples': { code: 'LE_TOUQUET', lat: 50.520, lon: 1.586 },  // Le Touquet-Étaples
  'le treport': { code: 'LE_TREPORT', lat: 50.059, lon: 1.383 },  // Le Tréport
  'locmariaquer': { code: 'LOCMARIAQUER', lat: 47.569, lon: -2.944 },  // Locmariaquer
  'locquemeau': { code: 'LOCQUEMEAU', lat: 48.723, lon: -3.563 },  // Locquemeau
  'locquirec': { code: 'LOCQUIREC', lat: 48.689, lon: -3.654 },  // Locquirec
  'loctudy': { code: 'LOCTUDY', lat: 47.832, lon: -4.175 },  // Loctudy
  'lherbaudiere ile de noirmoutier': { code: 'L_HERBAUDIERE', lat: 47.023, lon: -2.298 },  // L'Herbaudière (Île de Noirmoutier)
  'marseille corniche': { code: 'MARSEILLE', lat: 43.296, lon: 5.370 },  // Marseille (Corniche)
  'mimizan': { code: 'MIMIZAN', lat: 44.202, lon: -1.231 },  // Mimizan
  'ile molene': { code: 'MOLENE_NORD', lat: 48.396, lon: -4.957 },  // Île Molène
  'morgat': { code: 'MORGAT', lat: 48.226, lon: -4.505 },  // Morgat
  'nice': { code: 'NICE', lat: 43.701, lon: 7.268 },  // Nice
  'omonville-la-rogue': { code: 'OMONVILLE-LA-ROGUE', lat: 49.703, lon: -1.844 },  // Omonville-la-Rogue
  'baie de lampaul ile douessant': { code: 'OUESSANT_LAMPAUL', lat: 48.457, lon: -5.096 },  // Baie de Lampaul (Île d'Ouessant)
  'ouistreham': { code: 'OUISTREHAM', lat: 49.276, lon: -0.258 },  // Ouistreham
  'paimpol': { code: 'PAIMPOL', lat: 48.779, lon: -3.048 },  // Paimpol
  'saint-armel le passage': { code: 'PASSAGE_SAINT-ARMEL', lat: 48.014, lon: -1.591 },  // Saint-Armel (Le Passage)
  'penerf': { code: 'PENERF', lat: 47.510, lon: -2.622 },  // Pénerf
  'perros-guirec': { code: 'PERROS-GUIREC_TRESTRAOU', lat: 48.815, lon: -3.439 },  // Perros-Guirec
  'plogoff': { code: 'PLOGOFF', lat: 48.038, lon: -4.666 },  // Plogoff
  'ploumanach': { code: 'PLOUMANACH', lat: 48.832, lon: -3.484 },  // Ploumanac'h
  'pointe de saint-gildas': { code: 'POINTE_DE_SAINT-GILDAS', lat: 48.016, lon: -66.683 },  // Pointe de Saint-Gildas
  'pornic': { code: 'PORNIC', lat: 47.115, lon: -2.104 },  // Pornic
  'pornichet': { code: 'PORNICHET', lat: 47.261, lon: -2.336 },  // Pornichet
  'port-beni': { code: 'PORT-BENI', lat: 46.164, lon: 5.571 },  // Port-Béni
  'pointe de grave': { code: 'PORT-BLOC', lat: 45.567, lon: -1.065 },  // Pointe de Grave
  'port-en-bessin': { code: 'PORT-EN-BESSIN', lat: 49.346, lon: -0.753 },  // Port-en-Bessin
  'port-haliguen': { code: 'PORT-HALIGUEN', lat: 47.484, lon: -3.102 },  // Port-Haliguen
  'port-joinville ile dyeu': { code: 'PORT-JOINVILLE', lat: 46.727, lon: -2.351 },  // Port-Joinville (Île d'Yeu)
  'port-louis locmalo': { code: 'PORT-LOUIS_LOCMALO', lat: -20.162, lon: 57.503 },  // Port-Louis (Locmalo)
  'port-maria': { code: 'PORT-MARIA', lat: 18.368, lon: -76.909 },  // Port-Maria
  'port-navalo': { code: 'PORT-NAVALO', lat: 47.546, lon: -2.914 },  // Port-Navalo
  'port-tudy': { code: 'PORT-TUDY', lat: 47.643, lon: -3.447 },  // Port-Tudy
  'port-vendres': { code: 'PORT-VENDRES', lat: 42.520, lon: 3.106 },  // Port-Vendres
  'portbail': { code: 'PORTBAIL', lat: 49.336, lon: -1.700 },  // Portbail
  'portivy': { code: 'PORTIVY', lat: 47.529, lon: -3.146 },  // Portivy
  'portsall': { code: 'PORTSALL', lat: 48.558, lon: -4.698 },  // Portsall
  'port camargue': { code: 'PORT_CAMARGUE', lat: 43.523, lon: 4.141 },  // Port Camargue
  'lorient port de commerce': { code: 'PORT_COMMERCE_LORIENT', lat: 47.748, lon: -3.366 },  // Lorient (Port de commerce)
  'port-de-bouc': { code: 'PORT_DE_BOUC', lat: 43.403, lon: 4.981 },  // Port-de-Bouc
  'port-la-foret': { code: 'PORT_LA_FORET', lat: 47.901, lon: -3.971 },  // Port-la-Forêt
  'port-la-nouvelle': { code: 'PORT_LA_NOUVELLE', lat: 43.020, lon: 3.046 },  // Port-la-Nouvelle
  'port manech': { code: 'PORT_MANECH', lat: 47.801, lon: -3.742 },  // Port Manec'h
  'anse de primel': { code: 'PRIMEL', lat: 48.710, lon: -3.806 },  // Anse de Primel
  'le verdon-sur-mer': { code: 'PTE_DE_GRAVE_LE_VERDON', lat: 45.548, lon: -1.062 },  // Le Verdon-sur-Mer
  'richard': { code: 'RICHARD', lat: 52.695, lon: -107.703 },  // Richard
  'roscoff': { code: 'ROSCOFF', lat: 48.726, lon: -3.983 },  // Roscoff
  'royan': { code: 'ROYAN', lat: 45.625, lon: -1.029 },  // Royan
  'saint-cast': { code: 'SAINT-CAST', lat: 48.624, lon: -2.262 },  // Saint-Cast
  'saint-denis doleron': { code: 'SAINT-DENIS_D_OLERON', lat: 46.034, lon: -1.377 },  // Saint-Denis d'Oléron
  'saint-germain-sur-ay': { code: 'SAINT-GERMAIN-SUR-AY', lat: 49.235, lon: -1.595 },  // Saint-Germain-sur-Ay
  'saint-guenole': { code: 'SAINT-GUENOLE', lat: 48.814, lon: -3.335 },  // Saint-Guénolé
  'saint-malo': { code: 'SAINT-MALO', lat: 48.650, lon: -2.026 },  // Saint-Malo
  'saint-martin-de-re ile de re': { code: 'SAINT-MARTIN_DE_RE', lat: 46.202, lon: -1.368 },  // Saint-Martin-de-Ré (Île de Ré)
  'saint-nazaire': { code: 'SAINT-NAZAIRE', lat: 47.273, lon: -2.214 },  // Saint-Nazaire
  'saint-quay-portrieux': { code: 'SAINT-QUAY-PORTRIEUX', lat: 48.652, lon: -2.831 },  // Saint-Quay-Portrieux
  'saint-vaast-la-hougue': { code: 'SAINT-VAAST-LA-HOUGUE', lat: 49.588, lon: -1.266 },  // Saint-Vaast-la-Hougue
  'saint-valery-en-caux': { code: 'SAINT-VALERY-EN-CAUX', lat: 49.860, lon: 0.711 },  // Saint-Valery-en-Caux
  'sainte evette': { code: 'SAINTE_EVETTE', lat: 48.010, lon: -4.556 },  // Sainte Evette
  'saint-briac-sur-mer': { code: 'SAINT_BRIAC_SUR_MER', lat: 48.618, lon: -2.133 },  // Saint-Briac-sur-Mer
  'port de sete': { code: 'SETE', lat: 43.401, lon: 3.696 },  // Port de Sète
  'saint-jean-de-luz': { code: 'SOCOA', lat: 43.387, lon: -1.664 },  // Saint-Jean-de-Luz
  'solenzara': { code: 'SOLENZARA', lat: 41.856, lon: 9.399 },  // Solenzara
  'saint-gilles-croix-de-vie': { code: 'ST-GILLES-CROIX-DE-VIE', lat: 46.693, lon: -1.925 },  // Saint-Gilles-Croix-de-Vie
  'tinduff': { code: 'TINDUFF', lat: 48.335, lon: -4.370 },  // Tinduff
  'toulon': { code: 'TOULON', lat: 43.126, lon: 5.930 },  // Toulon
  'trebeurden': { code: 'TREBEURDEN', lat: 48.769, lon: -3.563 },  // Trébeurden
  'treguier': { code: 'TREGUIER', lat: 48.784, lon: -3.232 },  // Tréguier
  'trehiguier': { code: 'TREHIGUIER', lat: 47.493, lon: -2.442 },  // Tréhiguier
  'trez-hir': { code: 'TREZ-HIR', lat: 42.069, lon: -7.400 },  // Trez-Hir
  'vannes': { code: 'VANNES', lat: 47.659, lon: -2.760 },  // Vannes
  'vieux-boucau': { code: 'VIEUX-BOUCAU', lat: 43.785, lon: -1.404 },  // Vieux-Boucau
  'wissant': { code: 'WISSANT', lat: 50.885, lon: 1.663 },  // Wissant
  'aber benoit': { code: 'ABER_BENOIT_MEAN_RENEAT', lat: 48.583, lon: -4.617 },
  'aber wrach': { code: 'ABER_WRAC_H', lat: 48.598, lon: -4.567 },
  'ouessant': { code: 'BAIE_DU_STIFF', lat: 48.460, lon: -5.100 },
  'ile d ouessant': { code: 'BAIE_DU_STIFF', lat: 48.460, lon: -5.100 },
  'etel': { code: 'ENTREE_RIVIERE_ETEL', lat: 47.660, lon: -3.199 },
  'crouesty': { code: 'PORT_DU_CROUESTY', lat: 47.532, lon: -2.899 },
  'arzon': { code: 'PORT_DU_CROUESTY', lat: 47.532, lon: -2.899 },
  'berck': { code: 'BOUEE_FORT-MAHON', lat: 50.408, lon: 1.564 },
  'fort mahon': { code: 'BOUEE_FORT-MAHON', lat: 50.308, lon: 1.564 },
  'honfleur': { code: 'DEAUVILLE', lat: 49.419, lon: 0.233 },
  'seudre': { code: 'PONT_AVAL_DE_LA_SEUDRE', lat: 45.733, lon: -1.083 },
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
  // Extraire le HTML encapsulé dans les ifrm.document.write('...')
  const writeRegex = /ifrm\.document\.write\('([\s\S]*?)'\);/g;
  let html = '';
  let m;
  while ((m = writeRegex.exec(jsText)) !== null) {
    html += m[1]
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n/g, '\n');
  }

  if (!html) {
    throw new Error(`Réponse SHOM inattendue pour ${locationName}`);
  }

  // Parsing des <td> dans le HTML reconstitué
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const values = [];
  while ((m = tdRegex.exec(html)) !== null) {
    const val = m[1].trim();
    if (val) values.push(val);
  }

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
      isPast:       false,
      minutesUntil: minutesUntilTide(heure),
    });
  }

  if (tides.length === 0) {
    throw new Error(`Aucune marée extraite pour ${locationName}`);
  }

  const nextTide   = tides[0];
  const nextPM     = tides.find(t => t.isHigh && t.coefficient !== null);
  const coeffValue = nextPM?.coefficient ?? null;
  const pm         = tides.find(t => t.isHigh);
  const bm         = tides.find(t => !t.isHigh);
  const amplitude  = pm && bm ? parseFloat((pm.height - bm.height).toFixed(2)) : null;

  const coefficient = coeffValue !== null
    ? { value: coeffValue, label: getCoeffLabel(coeffValue), amplitude, source: 'SHOM officiel' }
    : amplitude !== null
    ? { value: estimateCoeff(amplitude), label: getCoeffLabel(estimateCoeff(amplitude)), amplitude, source: 'estimé' }
    : null;

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

function isDST(date) {
  const year = date.getUTCFullYear();
  
  // Passage heure été : dernier dimanche de mars à 1h UTC
  const lastSundayMarch = lastSunday(year, 2); // mois 2 = mars (0-indexé)
  
  // Passage heure hiver : dernier dimanche d'octobre à 1h UTC
  const lastSundayOctober = lastSunday(year, 9); // mois 9 = octobre
  
  return date >= lastSundayMarch && date < lastSundayOctober;
}

function lastSunday(year, month) {
  // Trouve le dernier dimanche du mois à 1h00 UTC
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0));
  const dayOfWeek = lastDay.getUTCDay();
  lastDay.setUTCDate(lastDay.getUTCDate() - dayOfWeek);
  return lastDay;
}

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
  const offset = isDST(now) ? 2 : 1;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowMinutes = (utcMinutes + offset * 60) % 1440;
  
  const tideMinutes = h * 60 + m;

  const diff = tideMinutes >= nowMinutes
    ? tideMinutes - nowMinutes
    : 1440 - nowMinutes + tideMinutes;

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
