const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ArcGIS FeatureServer endpoint for Delaware school district boundaries
const DISTRICTS_URL =
  'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Society/DE_Schools/FeatureServer/3/query?where=1%3D1&outFields=NAME,DIST_ID,SHORTNAME&outSR=4326&f=geojson';

// Closings XML feed
const CLOSINGS_URL = 'https://schoolclosings.delaware.gov/XML/PortalFeed';

// ── Fetch school district boundary GeoJSON ──────────────────────────
const fetchDistricts = async () => {
  try {
    const { data } = await axios.get(DISTRICTS_URL);
    console.log(`Fetched ${data.features.length} district boundaries`);
    return data;
  } catch (error) {
    console.error('Error fetching district boundaries:', error.message);
    return { type: 'FeatureCollection', features: [] };
  }
};

// ── Fetch closings from XML feed ────────────────────────────────────
const fetchClosings = async () => {
  try {
    const { data } = await axios.get(CLOSINGS_URL);
    const $ = cheerio.load(data, { xmlMode: true });
    const closings = [];

    $('row').each((index, element) => {
      const cells = $(element).find('cell');
      const district = $(cells[0]).text().trim();
      const details = $(cells[1]).text().trim();
      const title = $(cells[2]).text().trim();
      const date = $(cells[3]).text().trim();

      if (district) {
        // Determine status type from the text using word-boundary matching
        const lowerDetails = (details + ' ' + district + ' ' + title).toLowerCase();
        let statusType = 'closed'; // default
        if (/\bdelay(ed|s)?\b/.test(lowerDetails) || /\blate\s+(start|open)/.test(lowerDetails)) {
          statusType = 'delay';
        } else if (/\bearly\b/.test(lowerDetails) || /\bdismiss/.test(lowerDetails)) {
          statusType = 'early dismissal';
        }

        closings.push({
          schoolName: district,
          status: details || 'Closed',
          statusType,
          date,
        });
      }
    });

    return closings;
  } catch (error) {
    console.error('Error fetching school closings:', error.message);
    return [];
  }
};

// ── Match closings to district boundaries ───────────────────────────
function matchClosingToDistrict(closing, districtNames) {
  const closingLower = (closing.schoolName + ' ' + closing.status).toLowerCase();
  for (const name of districtNames) {
    // Try matching on the short name or full name
    const nameLower = name.toLowerCase();
    // Extract the core district word(s) before "school district"
    const core = nameLower.replace(/\s*school\s*district\s*/i, '').trim();
    if (closingLower.includes(core) && core.length > 2) {
      return name;
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const [districts, closings] = await Promise.all([fetchDistricts(), fetchClosings()]);

  const outDir = path.join(__dirname, 'public');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Get list of district names from GeoJSON
  const districtNames = districts.features.map(f => f.properties.NAME);

  // Match each closing to a district boundary name
  const closingsWithMatch = closings.map(c => {
    const matchedDistrict = matchClosingToDistrict(c, districtNames);
    return { ...c, matchedDistrict };
  });

  // Build a lookup: district name → closing info
  const closingsByDistrict = {};
  for (const c of closingsWithMatch) {
    if (c.matchedDistrict) {
      closingsByDistrict[c.matchedDistrict] = c;
    }
  }

  // Write district boundaries GeoJSON
  fs.writeFileSync(
    path.join(outDir, 'districts.geojson'),
    JSON.stringify(districts, null, 2)
  );

  // Write closings JSON (with match info)
  fs.writeFileSync(
    path.join(outDir, 'closings.json'),
    JSON.stringify(closingsWithMatch, null, 2)
  );

  // Write the lookup map
  fs.writeFileSync(
    path.join(outDir, 'closingsByDistrict.json'),
    JSON.stringify(closingsByDistrict, null, 2)
  );

  console.log(`\n✓ ${districts.features.length} district boundaries → public/districts.geojson`);
  console.log(`✓ ${closings.length} closings → public/closings.json`);
  console.log(`✓ ${Object.keys(closingsByDistrict).length} matched to districts → public/closingsByDistrict.json`);
  console.log('\nMatched closings:');
  for (const [dist, info] of Object.entries(closingsByDistrict)) {
    console.log(`  ${dist} → ${info.statusType}`);
  }

  const unmatched = closingsWithMatch.filter(c => !c.matchedDistrict);
  if (unmatched.length) {
    console.log('\nUnmatched closings:');
    unmatched.forEach(c => console.log(`  "${c.schoolName}"`));
  }
}

main();
