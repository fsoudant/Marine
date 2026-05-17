/**
 * generate_ports.js
 * Lit shom_ports.xml, filtre les ports français métropolitains,
 * les géocode via OpenWeatherMap, et génère le tableau PORTS
 * pour tidesService.js
 *
 * Usage : OPENWEATHER_API_KEY=VOTRE_CLE node generate_ports.js
 */

const https = require('https');
const fs    = require('fs');

const API_KEY  = process.env.OPENWEATHER_API_KEY;
const XML_FILE = 'shom_ports.xml';

if (!API_KEY) {
  console.error('Manque OPENWEATHER_API_KEY');
  process.exit(1);
}

// ─── 1. Parse XML ─────────────────────────────────────────────────────────────
const xml = fs.readFileSync(XML_FILE, 'utf8');
const harborRegex = /<harbor\s+([^/]+)\/>/g;

const ports = [];
let m;
while ((m = harborRegex.exec(xml)) !== null) {
  const attrs = m[1];
  const get = (attr) => {
    const r = new RegExp(`${attr}="([^"]*)"`);
    const match = attrs.match(r);
    return match ? match[1] : '';
  };

  // Filtre : France métropolitaine uniquement
  if (get('country') !== 'France') continue;
  if (get('hLegale') !== '1') continue;
  if (get('isOfficial') !== '1') continue;

  ports.push({ cst: get('cst'), name: get('name') });
}

console.error(`${ports.length} ports français métropolitains trouvés`);

// ─── 2. Géocodage OpenWeatherMap ──────────────────────────────────────────────

// Nettoie le nom pour améliorer le géocodage
function cleanName(name) {
  return name
    .replace(/\(.*?\)/g, '')        // Supprime les parenthèses : "Auray (St-Goustan)" → "Auray"
    .replace(/^(Île de|Île d'|Port de|Port d'|Anse de|Baie de|Baie d'|Bouée|Entrée|Rivière|PK\s[\d.,]+\s*:.*)/i, '')
    .replace(/[-–]\s*(Terminal|Large|Moulin|Quai|Plage|Lagon|Ouest|Est|Nord|Sud).*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function geocode(name) {
  // Tente plusieurs variantes du nom
  const variants = [
    name,                           // Nom complet original
    cleanName(name),                // Nom nettoyé
    name.split(/[-–(,]/)[0].trim(), // Premier segment avant tiret/virgule
  ].filter((v, i, arr) => v.length > 2 && arr.indexOf(v) === i); // Dédoublonne

  return tryVariants(variants);
}

function tryVariants(variants) {
  if (variants.length === 0) return Promise.resolve(null);
  const [current, ...rest] = variants;

  return new Promise((resolve) => {
    const query = `${current}, France`;
    const path  = `/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${API_KEY}`;

    https.get({ hostname: 'api.openweathermap.org', path }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            resolve({ lat: results[0].lat, lon: results[0].lon });
          } else {
            // Essaie la variante suivante
            setTimeout(() => tryVariants(rest).then(resolve), 120);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── 3. Génération du tableau PORTS ──────────────────────────────────────────
async function main() {
  const results = [];

  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    const coords = await geocode(port.name);

    if (coords) {
      // Clé = nom en minuscules sans accents pour resolvePortByName()
      const key = port.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s\-]/g, '')
        .trim();

      results.push({ key, cst: port.cst, name: port.name, ...coords });
      console.error(`✅ ${port.name} → ${coords.lat}, ${coords.lon}`);
    } else {
      console.error(`❌ ${port.name} → introuvable`);
    }

    // Pause pour respecter la limite OWM (1000 req/jour gratuit)
    if (i % 10 === 9) await sleep(1000);
    else await sleep(120);
  }

  // ─── Génère le code JS ──────────────────────────────────────────────────────
  let output = '// Généré automatiquement depuis shom_ports.xml\n';
  output += 'const PORTS = {\n';

  for (const p of results) {
    const lat = p.lat.toFixed(3);
    const lon = p.lon.toFixed(3);
    output += `  '${p.key}': { code: '${p.cst}', lat: ${lat}, lon: ${lon} },  // ${p.name}\n`;
  }

  output += '};\n';

  fs.writeFileSync('ports_generated.js', output);
  console.error(`\n✅ ${results.length} ports générés dans ports_generated.js`);
}

main().catch(console.error);