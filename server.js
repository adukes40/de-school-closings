const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

const DISTRICTS_URL =
  'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Society/DE_Schools/FeatureServer/3/query?where=1%3D1&outFields=NAME,DIST_ID,SHORTNAME&outSR=4326&f=geojson';
const CLOSINGS_URL = 'https://schoolclosings.delaware.gov/XML/PortalFeed';

// Simple in-memory cache — districts rarely change, closings update throughout day
let districtsCache = null;
let closingsCache = null;
let closingsLastFetched = 0;
const CLOSINGS_TTL = 3 * 60 * 1000; // refresh closings every 3 minutes

function detectStatusType(text) {
  const lower = text.toLowerCase();
  if (/\bdelay(ed|s)?\b/.test(lower) || /\blate\s+(start|open)/.test(lower)) return 'delay';
  if (/\bearly\b/.test(lower) || /\bdismiss/.test(lower)) return 'early dismissal';
  return 'closed';
}

async function fetchDistricts() {
  if (districtsCache) return districtsCache;
  const { data } = await axios.get(DISTRICTS_URL);
  districtsCache = data;
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

  // Build lookup by district name
  const districts = await fetchDistricts();
  const districtNames = districts.features.map(f => f.properties.NAME);

  function matchDistrict(closing) {
    const lower = (closing.schoolName + ' ' + closing.status).toLowerCase();
    for (const name of districtNames) {
      const core = name.toLowerCase().replace(/\s*school\s*district\s*/i, '').trim();
      if (core.length > 2 && lower.includes(core)) return name;
    }
    return null;
  }

  const withMatch = closings.map(c => ({ ...c, matchedDistrict: matchDistrict(c) }));

  const byDistrict = {};
  for (const c of withMatch) {
    if (c.matchedDistrict) byDistrict[c.matchedDistrict] = c;
  }

  closingsCache = { closings: withMatch, byDistrict, fetchedAt: new Date().toISOString() };
  closingsLastFetched = now;
  return closingsCache;
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/api/districts', async (req, res) => {
  try {
    res.json(await fetchDistricts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/closings', async (req, res) => {
  try {
    res.json(await fetchClosings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
