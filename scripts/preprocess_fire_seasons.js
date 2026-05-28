const fs = require("fs");
const path = require("path");

// 1. Data Structures & Maps
const stateNameMap = {
  "NSW": "New South Wales",
  "VIC": "Victoria",
  "QLD": "Queensland",
  "SA": "South Australia",
  "WA": "Western Australia",
  "TAS": "Tasmania",
  "NT": "Northern Territory",
  "ACT": "Australian Capital Territory"
};

const stateNormalize = {
  "nsw": "NSW",
  "vic": "VIC",
  "qld": "QLD",
  "sa": "SA",
  "wa": "WA",
  "tas": "TAS",
  "nt": "NT",
  "act": "ACT"
};

const seasons = [
  { field: "FIRE_1617", name: "2016–17" },
  { field: "FIRE_1718", name: "2017–18" },
  { field: "FIRE_1819", name: "2018–19" },
  { field: "FIRE_1920", name: "2019–20" },
  { field: "FIRE_2021", name: "2020–21" }
];

const centroids = {
  "WA": { lon: 121.6, lat: -25.9 },
  "NT": { lon: 133.8, lat: -19.5 },
  "QLD": { lon: 144.7, lat: -22.5 },
  "SA": { lon: 135.0, lat: -30.0 },
  "NSW": { lon: 160.0, lat: -32.0 },
  "VIC": { lon: 144.4, lat: -37.0 },
  "TAS": { lon: 147.0, lat: -42.0 },
  "ACT": { lon: 149.0, lat: -35.3 }
};

function formatCount(num) {
  if (num === 0 || !num) return "0";
  if (num >= 1000000) {
    const val = num / 1000000;
    return val % 1 === 0 ? val.toFixed(0) + "M" : val.toFixed(1) + "M";
  }
  if (num >= 1000) {
    const val = num / 1000;
    return val % 1 === 0 ? val.toFixed(0) + "K" : val.toFixed(1) + "K";
  }
  return num.toString();
}

// 2. Parse CSV
console.log("Reading Choropleth bivariate.csv...");
const csvPath = path.join(__dirname, "../data/Choropleth bivariate.csv");
const rawData = fs.readFileSync(csvPath, "utf8");

const lines = rawData.split(/\r?\n/);
const headers = lines[0].split(",").map((h) => h.trim());
const colMap = {};
headers.forEach((h, i) => {
  colMap[h] = i;
});

const summary = {};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const parts = [];
  let current = "";
  let inQuotes = false;
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());

  if (parts.length < headers.length) continue;

  const forestVal = parseInt(parts[colMap["FOREST"]], 10);
  if (forestVal !== 1) continue;

  const stateRaw = parts[colMap["STATE"]];
  if (!stateRaw) continue;

  const stateCode = stateNormalize[stateRaw.toLowerCase()];
  if (!stateCode) continue;

  const countVal = parseInt(parts[colMap["COUNT"]], 10);
  if (isNaN(countVal)) continue;

  if (!summary[stateCode]) {
    summary[stateCode] = {};
    seasons.forEach((s) => {
      summary[stateCode][s.name] = { planned: 0, unplanned: 0 };
    });
  }

  seasons.forEach((s) => {
    const fireVal = parts[colMap[s.field]];
    if (fireVal === "P") {
      summary[stateCode][s.name].planned += countVal;
    } else if (fireVal === "U") {
      summary[stateCode][s.name].unplanned += countVal;
    }
  });
}

// 3. Generate Summary Object and CSV Rows
console.log("Calculating season summary stats...");
const csvRows = [
  "state_code,state_name,season,planned_burn_count,unplanned_burn_count,total_burn_count,unplanned_share,unplanned_share_pct,centroid_lon,centroid_lat,planned_label,unplanned_label,total_label,unplanned_share_label"
];

const stateSummaryData = {}; // structure: stateSummaryData[stateName][seasonName] = dataObject

Object.keys(centroids).forEach((stateCode) => {
  const stateName = stateNameMap[stateCode];
  const centroid = centroids[stateCode];

  if (!stateSummaryData[stateName]) {
    stateSummaryData[stateName] = {};
  }

  seasons.forEach((s) => {
    const seasonName = s.name;
    const counts =
      summary[stateCode] && summary[stateCode][seasonName]
        ? summary[stateCode][seasonName]
        : { planned: 0, unplanned: 0 };

    const planned = counts.planned;
    const unplanned = counts.unplanned;
    const total = planned + unplanned;

    let unplannedShare = null;
    let unplannedSharePct = null;
    let unplannedShareLabel = "N/A";

    if (total > 0) {
      unplannedShare = unplanned / total;
      unplannedSharePct = unplannedShare * 100;
      unplannedShareLabel = Math.round(unplannedSharePct) + "%";
    }

    const dataObj = {
      state_code: stateCode,
      state_name: stateName,
      season: seasonName,
      planned_burn_count: planned,
      unplanned_burn_count: unplanned,
      total_burn_count: total,
      unplanned_share: unplannedShare === null ? null : unplannedShare,
      unplanned_share_pct:
        unplannedSharePct === null ? null : unplannedSharePct,
      centroid_lon: centroid.lon,
      centroid_lat: centroid.lat,
      planned_label: formatCount(planned),
      unplanned_label: formatCount(unplanned),
      total_label: formatCount(total),
      unplanned_share_label: unplannedShareLabel
    };

    stateSummaryData[stateName][seasonName] = dataObj;

    const csvRow = [
      stateCode,
      `"${stateName}"`,
      `"${seasonName}"`,
      planned,
      unplanned,
      total,
      unplannedShare === null ? "" : unplannedShare.toFixed(6),
      unplannedSharePct === null ? "" : unplannedSharePct.toFixed(2),
      centroid.lon,
      centroid.lat,
      `"${dataObj.planned_label}"`,
      `"${dataObj.unplanned_label}"`,
      `"${dataObj.total_label}"`,
      `"${dataObj.unplanned_share_label}"`
    ].join(",");
    csvRows.push(csvRow);
  });
});

console.log("Writing state_fire_season_summary.csv...");
fs.writeFileSync(
  path.join(__dirname, "../data/state_fire_season_summary.csv"),
  csvRows.join("\n")
);

// 4. Generate Season-Expanded GeoJSON
console.log("Reading original australian_states.geojson...");
const geojsonPath = path.join(__dirname, "../data/australian_states.geojson");
const originalGeoJSON = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));

const expandedFeatures = [];
let idCounter = 0;

originalGeoJSON.features.forEach((feature) => {
  const originalStateName = feature.properties.STATE_NAME;

  // Normalise state name matching (just in case)
  let matchedStateName = null;
  Object.values(stateNameMap).forEach((name) => {
    if (name.toLowerCase() === originalStateName.toLowerCase()) {
      matchedStateName = name;
    }
  });

  if (!matchedStateName) {
    console.warn(`Could not match state name: ${originalStateName}`);
    return;
  }

  seasons.forEach((s) => {
    const seasonName = s.name;
    const stats =
      stateSummaryData[matchedStateName] &&
      stateSummaryData[matchedStateName][seasonName];

    if (!stats) {
      console.warn(
        `No stats for state: ${matchedStateName}, season: ${seasonName}`
      );
      return;
    }

    // Duplicate feature
    const newFeature = {
      type: "Feature",
      id: idCounter++,
      properties: {
        STATE_CODE: feature.properties.STATE_CODE,
        STATE_NAME: originalStateName,
        state_code: stats.state_code,
        state_name: stats.state_name,
        season: stats.season,
        planned_burn_count: stats.planned_burn_count,
        unplanned_burn_count: stats.unplanned_burn_count,
        total_burn_count: stats.total_burn_count,
        unplanned_share: stats.unplanned_share,
        unplanned_share_pct: stats.unplanned_share_pct,
        planned_label: stats.planned_label,
        unplanned_label: stats.unplanned_label,
        total_label: stats.total_label,
        unplanned_share_label: stats.unplanned_share_label,
        centroid_lon: stats.centroid_lon,
        centroid_lat: stats.centroid_lat
      },
      geometry: feature.geometry
    };

    expandedFeatures.push(newFeature);
  });
});

const expandedGeoJSON = {
  type: "FeatureCollection",
  features: expandedFeatures
};

console.log("Writing australia_states_fire_seasons.geojson...");
const outGeoJSONPath = path.join(
  __dirname,
  "../data/australia_states_fire_seasons.geojson"
);
fs.writeFileSync(outGeoJSONPath, JSON.stringify(expandedGeoJSON));
console.log("Data preprocessing successfully completed!");
