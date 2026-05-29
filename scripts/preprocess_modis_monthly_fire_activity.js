const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");

const inputDirs = [
  path.join(repoRoot, "datasets"),
  path.join(repoRoot, "Datasets"),
  path.join(repoRoot, "Datasets", "19-24 nasa")
];

const inputFiles = [
  "modis_2018_Australia.csv",
  "modis_2019_Australia.csv",
  "modis_2020_Australia.csv",
  "modis_2021_Australia.csv",
  "modis_2022_Australia.csv",
  "modis_2023_Australia.csv",
  "modis_2024_Australia.csv"
];

const monthLabels = [
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun"
];

const completeFireSeasons = [
  "2018-19",
  "2019-20",
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24"
];

const stateNameToCode = {
  "New South Wales": "NSW",
  Victoria: "VIC",
  Queensland: "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  Tasmania: "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT"
};

const stateCodeOrder = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
const spatialJoinOrder = ["ACT", "NSW", "VIC", "SA", "QLD", "NT", "WA", "TAS"];
const southeastStates = new Set(["NSW", "VIC", "ACT", "SA"]);

function resolveInputPath(fileName) {
  for (const dir of inputDirs) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Could not find required input file: ${fileName}`);
}

function resolveStateGeojsonPath() {
  const candidates = [
    path.join(repoRoot, "data", "australian_states.geojson"),
    path.join(repoRoot, "data", "australia_states_fire_seasons.geojson")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Could not find an Australia states GeoJSON for spatial join");
}

function parseDateParts(dateText) {
  const trimmed = String(dateText || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month };
}

function getFireSeason(year, month) {
  if (month >= 7) {
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  }
  return `${year - 1}-${String(year % 100).padStart(2, "0")}`;
}

function getMonthOrder(month) {
  return month >= 7 ? month - 6 : month + 6;
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function getHeaderMap(headers) {
  const headerMap = new Map();
  headers.forEach((header, index) => {
    headerMap.set(header.trim(), index);
  });
  return headerMap;
}

function getColumnIndex(headerMap, names, fileName) {
  for (const name of names) {
    if (headerMap.has(name)) return headerMap.get(name);
  }

  throw new Error(`Missing required column ${names.join("/")} in ${fileName}`);
}

function getOptionalColumnIndex(headerMap, names) {
  for (const name of names) {
    if (headerMap.has(name)) return headerMap.get(name);
  }

  return -1;
}

function confidenceBand(value) {
  const numeric = Number(String(value || "").trim());
  if (!Number.isFinite(numeric)) return "unknown/non-numeric";
  if (numeric < 30) return "low (0-29)";
  if (numeric < 80) return "nominal (30-79)";
  return "high (80-100)";
}

function bboxFromRing(ring) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const point of ring) {
    const lon = point[0];
    const lat = point[1];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLon, maxLon, minLat, maxLat };
}

function mergeBbox(target, bbox) {
  if (bbox.minLon < target.minLon) target.minLon = bbox.minLon;
  if (bbox.maxLon > target.maxLon) target.maxLon = bbox.maxLon;
  if (bbox.minLat < target.minLat) target.minLat = bbox.minLat;
  if (bbox.maxLat > target.maxLat) target.maxLat = bbox.maxLat;
}

function bboxContains(bbox, lon, lat) {
  return (
    lon >= bbox.minLon &&
    lon <= bbox.maxLon &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

function pointInRing(lon, lat, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPreparedPolygon(lon, lat, polygon) {
  if (!bboxContains(polygon.bbox, lon, lat)) return false;
  if (!pointInRing(lon, lat, polygon.outer)) return false;

  for (const hole of polygon.holes) {
    if (bboxContains(hole.bbox, lon, lat) && pointInRing(lon, lat, hole.ring)) {
      return false;
    }
  }

  return true;
}

function polygonAreaFromBbox(bbox) {
  return Math.max(0, bbox.maxLon - bbox.minLon) * Math.max(0, bbox.maxLat - bbox.minLat);
}

function prepareStateShapes() {
  const geojsonPath = resolveStateGeojsonPath();
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
  const byState = new Map();

  for (const feature of geojson.features || []) {
    const stateName = feature.properties?.STATE_NAME || feature.properties?.state_name;
    const stateCode =
      feature.properties?.state_code ||
      feature.properties?.STATE_ABBR ||
      stateNameToCode[stateName];

    if (!stateCode || !feature.geometry) continue;

    const rawPolygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [];

    const preparedPolygons = rawPolygons
      .filter((polygon) => Array.isArray(polygon) && polygon.length > 0)
      .map((polygon) => {
        const outer = polygon[0];
        const bbox = bboxFromRing(outer);
        const holes = polygon.slice(1).map((ring) => ({
          ring,
          bbox: bboxFromRing(ring)
        }));

        return { outer, holes, bbox, area: polygonAreaFromBbox(bbox) };
      })
      .sort((a, b) => b.area - a.area);

    const stateBbox = {
      minLon: Infinity,
      maxLon: -Infinity,
      minLat: Infinity,
      maxLat: -Infinity
    };

    preparedPolygons.forEach((polygon) => mergeBbox(stateBbox, polygon.bbox));

    byState.set(stateCode, {
      state: stateCode,
      bbox: stateBbox,
      polygons: preparedPolygons
    });
  }

  return spatialJoinOrder.map((stateCode) => byState.get(stateCode)).filter(Boolean);
}

function findState(lon, lat, stateShapes) {
  for (const stateShape of stateShapes) {
    if (!bboxContains(stateShape.bbox, lon, lat)) continue;

    for (const polygon of stateShape.polygons) {
      if (pointInPreparedPolygon(lon, lat, polygon)) {
        return stateShape.state;
      }
    }
  }

  return null;
}

function buildMonthlyRows(countMap) {
  const rows = [];

  for (const fireSeason of completeFireSeasons) {
    for (let monthOrder = 1; monthOrder <= 12; monthOrder++) {
      const key = `${fireSeason}|${monthOrder}`;
      rows.push({
        fire_season: fireSeason,
        month_name: monthLabels[monthOrder - 1],
        month_order: monthOrder,
        detection_count: countMap.get(key) || 0
      });
    }
  }

  return rows;
}

function writeMonthlyCsv(fileName, rows) {
  const csv = [
    "fire_season,month_name,month_order,detection_count",
    ...rows.map((row) =>
      [
        csvEscape(row.fire_season),
        csvEscape(row.month_name),
        row.month_order,
        row.detection_count
      ].join(",")
    )
  ].join("\n");

  fs.writeFileSync(path.join(repoRoot, "data", fileName), csv);
  return csv;
}

function seasonTotals(monthlyRows) {
  const totals = new Map();
  monthlyRows.forEach((row) => increment(totals, row.fire_season, row.detection_count));
  return completeFireSeasons.map((season) => [season, totals.get(season) || 0]);
}

function validateMonthlyCoverage(label, rows) {
  const counts = new Map();
  rows.forEach((row) => increment(counts, row.fire_season));
  const incomplete = [...counts.entries()].filter(([, count]) => count !== 12);

  if (incomplete.length > 0) {
    console.warn(
      `warning: ${label} output has seasons without exactly 12 months: ${JSON.stringify(incomplete)}`
    );
  }
}

function formatTotals(totals) {
  return totals.map(([season, count]) => `${season}: ${count.toLocaleString()}`).join("\n");
}

const stateShapes = prepareStateShapes();
const monthlyNationalCounts = new Map();
const monthlySoutheastCounts = new Map();
const stateSeasonCounts = new Map();
const typeCounts = new Map();
const confidenceBandCounts = new Map();

let rawRowsCombined = 0;
let validRowsAfterCleaning = 0;
let rowsInCompleteFireSeasons = 0;
let matchedStateRows = 0;
let unmatchedStateRows = 0;

for (const fileName of inputFiles) {
  const filePath = resolveInputPath(fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(",").map((header) => header.trim());
  const headerMap = getHeaderMap(headers);
  const dateIndex = getColumnIndex(headerMap, ["acq_date"], fileName);
  const latIndex = getColumnIndex(headerMap, ["latitude", "lat"], fileName);
  const lonIndex = getColumnIndex(headerMap, ["longitude", "lon"], fileName);
  const confidenceIndex = getOptionalColumnIndex(headerMap, ["confidence"]);
  const typeIndex = getOptionalColumnIndex(headerMap, ["type"]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    rawRowsCombined += 1;

    const columns = line.split(",");
    const dateParts = parseDateParts(columns[dateIndex]);
    const latitude = Number(String(columns[latIndex] || "").trim());
    const longitude = Number(String(columns[lonIndex] || "").trim());

    if (!dateParts || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    validRowsAfterCleaning += 1;

    if (typeIndex !== -1) {
      increment(typeCounts, String(columns[typeIndex] || "blank").trim() || "blank");
    }

    if (confidenceIndex !== -1) {
      increment(confidenceBandCounts, confidenceBand(columns[confidenceIndex]));
    }

    const { year, month } = dateParts;
    const fireSeason = getFireSeason(year, month);
    if (!completeFireSeasons.includes(fireSeason)) continue;

    rowsInCompleteFireSeasons += 1;

    const monthOrder = getMonthOrder(month);
    const monthKey = `${fireSeason}|${monthOrder}`;
    increment(monthlyNationalCounts, monthKey);

    const state = findState(longitude, latitude, stateShapes);
    if (state) {
      matchedStateRows += 1;
      increment(stateSeasonCounts, `${state}|${fireSeason}`);

      if (southeastStates.has(state)) {
        increment(monthlySoutheastCounts, monthKey);
      }
    } else {
      unmatchedStateRows += 1;
    }
  }
}

const dataDir = path.join(repoRoot, "data");
fs.mkdirSync(dataDir, { recursive: true });

const nationalRows = buildMonthlyRows(monthlyNationalCounts);
const southeastRows = buildMonthlyRows(monthlySoutheastCounts);

validateMonthlyCoverage("national", nationalRows);
validateMonthlyCoverage("southeast", southeastRows);

const nationalCsv = writeMonthlyCsv("monthly_fire_activity_national.csv", nationalRows);
writeMonthlyCsv("monthly_fire_activity_southeast.csv", southeastRows);

const qcStateRows = [];
for (const state of stateCodeOrder) {
  for (const fireSeason of completeFireSeasons) {
    qcStateRows.push({
      state,
      fire_season: fireSeason,
      detection_count: stateSeasonCounts.get(`${state}|${fireSeason}`) || 0
    });
  }
}

const qcCsv = [
  "state,fire_season,detection_count",
  ...qcStateRows.map((row) =>
    [csvEscape(row.state), csvEscape(row.fire_season), row.detection_count].join(",")
  )
].join("\n");

fs.writeFileSync(path.join(dataDir, "monthly_fire_activity_qc_by_state.csv"), qcCsv);

console.log(`total raw rows: ${rawRowsCombined}`);
console.log(
  `valid rows kept: ${rowsInCompleteFireSeasons} complete-season rows from ${validRowsAfterCleaning} rows with valid date/location`
);
console.log(`fire seasons included: ${completeFireSeasons.join(", ")}`);
console.log("FIRMS type value counts inspected; no type filter applied:");
console.log(
  [...typeCounts.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([typeValue, count]) => `${typeValue}: ${count.toLocaleString()}`)
    .join("\n")
);
console.log("confidence band QC, all retained:");
console.log(
  [...confidenceBandCounts.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([band, count]) => `${band}: ${count.toLocaleString()}`)
    .join("\n")
);
console.log(`state spatial join matched rows: ${matchedStateRows.toLocaleString()}`);
console.log(`state spatial join unmatched rows: ${unmatchedStateRows.toLocaleString()}`);
console.log("national totals by season:");
console.log(formatTotals(seasonTotals(nationalRows)));
console.log("southeast totals by season (NSW, VIC, ACT, SA):");
console.log(formatTotals(seasonTotals(southeastRows)));
console.log("preview of monthly_fire_activity_national.csv:");
console.log(nationalCsv.split("\n").slice(0, 19).join("\n"));
console.log("preview of monthly_fire_activity_southeast.csv:");
console.log(
  [
    "fire_season,month_name,month_order,detection_count",
    ...southeastRows.slice(0, 18).map((row) =>
      [
        csvEscape(row.fire_season),
        csvEscape(row.month_name),
        row.month_order,
        row.detection_count
      ].join(",")
    )
  ].join("\n")
);
