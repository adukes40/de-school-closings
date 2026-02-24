const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

const DISTRICTS_URL =
  'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Society/DE_Schools/FeatureServer/3/query?where=1%3D1&outFields=NAME,DIST_ID,SHORTNAME&outSR=4326&f=geojson';

const VOTECH_URL =
  'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Society/DE_Schools/FeatureServer/2/query?where=1%3D1&outFields=VOTECH,SHORTNAME,DIST_ID&outSR=4326&f=geojson';

const CHARTER_URL =
  'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Society/DE_Schools/FeatureServer/0/query?where=CHARTER%3D%27Y%27&outFields=SCHOOLNAME,SCHOOLSHOR&outSR=4326&f=geojson&resultRecordCount=1000';

const CLOSINGS_URL = 'https://schoolclosings.delaware.gov/XML/PortalFeed';

// Maps VOTECH field value → friendly display name + match terms for the closing feed
const VOTECH_MAP = {
  'NEW CASTLE': {
    displayName: 'New Castle County Vocational-Technical School District',
    matchTerms: ['new castle county vo', 'ncc votech', 'ncco votech', 'new castle vocational'],
  },
  'POLYTECH': {
    displayName: 'Polytech School District',
    matchTerms: ['polytech'],
  },
  'SUSSEX TECH': {
    displayName: 'Sussex Technical School District',
    matchTerms: ['sussex tech'],
  },
};

// Simple in-memory cache — static data cached permanently, closings refresh every 3 min
let districtsCache = null;
let votechCache = null;
let charterCache = null;
let closingsCache = null;
let closingsLastFetched = 0;
const CLOSINGS_TTL = 3 * 60 * 1000;

function detectStatusType(text) {
  const lower = text.toLowerCase();
  if (/\bdelay(ed|s)?\b/.test(lower)) return 'delay';
  if (/\bearly\s+dismissal\b/.test(lower)) return 'early dismissal';
  if (/\bclos(ed|ing|ure|ures)\b/.test(lower)) return 'closed';
  return 'info'; // no actionable keyword — treat as informational notice
}

async function fetchDistricts() {
  if (districtsCache) return districtsCache;
  const { data } = await axios.get(DISTRICTS_URL);
  districtsCache = data;
  return data;
}

async function fetchVotechDistricts() {
  if (votechCache) return votechCache;
  const { data } = await axios.get(VOTECH_URL);
  // Enrich each feature with a friendly NAME based on VOTECH_MAP
  const enriched = {
    ...data,
    features: data.features.map(f => {
      const key = f.properties.VOTECH;
      const mapped = VOTECH_MAP[key];
      return {
        ...f,
        properties: {
          ...f.properties,
          NAME: mapped ? mapped.displayName : key,
        },
      };
    }),
  };
  votechCache = enriched;
  return enriched;
}

async function fetchCharterSchools() {
  if (charterCache) return charterCache;
  const { data } = await axios.get(CHARTER_URL);
  charterCache = data;
  return data;
}

async function fetchClosings() {
  const now = Date.now();
  if (closingsCache && now - closingsLastFetched < CLOSINGS_TTL) {
    return closingsCache;
  }

  const { data } = await axios.get(CLOSINGS_URL);
  const $ = cheerio.load(data, { xmlMode: true });
  const closings = [];

  $('row').each((i, el) => {
    const cells = $(el).find('cell');
    const district = $(cells[0]).text().trim();
    const details  = $(cells[1]).text().trim();
    const title    = $(cells[2]).text().trim();
    const date     = $(cells[3]).text().trim();
    if (!district) return;

    const combined = `${details} ${district} ${title}`;
    closings.push({
      schoolName: district,
      status: details || 'Closed',
      statusType: detectStatusType(combined),
      date,
    });
  });

  // Load all school/district data in parallel for matching
  const [districts, votechData, charterData] = await Promise.all([
    fetchDistricts(),
    fetchVotechDistricts(),
    fetchCharterSchools(),
  ]);

  const districtNames = districts.features.map(f => f.properties.NAME);
  const charterNames = charterData.features.map(f => f.properties.SCHOOLNAME).filter(Boolean);

  // Match a closing to a traditional school district
  function matchDistrict(closing) {
    const lower = (closing.schoolName + ' ' + closing.status).toLowerCase();
    for (const name of districtNames) {
      const core = name.toLowerCase().replace(/\s*school\s*district\s*/i, '').trim();
      if (core.length > 2 && lower.includes(core)) return name;
    }
    return null;
  }

  // Match a closing to a VoTech district (using VOTECH key as dict key)
  function matchVotech(closing) {
    const lower = (closing.schoolName + ' ' + closing.status).toLowerCase();
    for (const [key, info] of Object.entries(VOTECH_MAP)) {
      const core = info.displayName.toLowerCase().replace(/\s*school\s*district\s*/i, '').trim();
      if (core.length > 2 && lower.includes(core)) return key;
      for (const term of info.matchTerms) {
        if (lower.includes(term)) return key;
      }
      if (lower.includes(key.toLowerCase())) return key;
    }
    return null;
  }

  const byDistrict = {};
  const byVotech   = {};
  const byCharter  = {};

  // Map each closing to traditional districts and votech districts
  for (const c of closings) {
    const dm = matchDistrict(c);
    const vm = matchVotech(c);
    if (dm && !byDistrict[dm]) byDistrict[dm] = { ...c, matchedDistrict: dm };
    if (vm && !byVotech[vm])   byVotech[vm]   = { ...c, matchedVotech: vm };
  }

  // For each charter school, find if any closing in the feed matches it
  for (const schoolName of charterNames) {
    // Strip parentheticals like "(Lower School)" for matching
    const arcgisCore = schoolName.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
    for (const c of closings) {
      const feedLower = (c.schoolName + ' ' + c.status).toLowerCase();
      const feedName  = c.schoolName.toLowerCase();
      const matched =
        feedLower.includes(arcgisCore) ||
        (arcgisCore.includes(feedName) && feedName.length > 5);
      if (matched) {
        byCharter[schoolName] = { ...c, matchedCharter: schoolName };
        break;
      }
    }
  }

  closingsCache = {
    closings,
    byDistrict,
    byVotech,
    byCharter,
    fetchedAt: new Date().toISOString(),
  };
  closingsLastFetched = now;
  return closingsCache;
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/api/districts', async (req, res) => {
  try { res.json(await fetchDistricts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/votech-districts', async (req, res) => {
  try { res.json(await fetchVotechDistricts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/charter-schools', async (req, res) => {
  try { res.json(await fetchCharterSchools()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/closings', async (req, res) => {
  try { res.json(await fetchClosings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// In production, serve the React build
if (IS_PROD) {
  const buildPath = path.join(__dirname, 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  console.log(`Closings cache TTL: ${CLOSINGS_TTL / 1000}s`);
});
