const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const inputPath = path.join(repoRoot, "data", "state_fire_season_summary.csv");
const outputPath = path.join(repoRoot, "data", "fire_risk_trajectories_state_season.csv");

const seasonOrder = new Map([
  ["2016–17", 1],
  ["2017–18", 2],
  ["2018–19", 3],
  ["2019–20", 4],
  ["2020–21", 5]
]);

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function compactCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number >= 1000000) {
    const millions = number / 1000000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (number >= 1000) {
    const thousands = number / 1000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(Math.round(number));
}

const raw = fs.readFileSync(inputPath, "utf8").trim();
const lines = raw.split(/\r?\n/);
const headers = parseCsvLine(lines[0]).map((header) => header.trim());
const col = Object.fromEntries(headers.map((header, index) => [header, index]));

const required = [
  "state_code",
  "state_name",
  "season",
  "planned_burn_count",
  "unplanned_burn_count",
  "total_burn_count",
  "unplanned_share_pct"
];

for (const name of required) {
  if (!(name in col)) {
    throw new Error(`Missing required column in ${inputPath}: ${name}`);
  }
}

const rows = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const fields = parseCsvLine(line);
  const planned = Number(fields[col.planned_burn_count]);
  const unplanned = Number(fields[col.unplanned_burn_count]);
  const totalFromSource = Number(fields[col.total_burn_count]);
  const total = Number.isFinite(totalFromSource) ? totalFromSource : planned + unplanned;
  const unplannedShare = total > 0 ? (unplanned / total) * 100 : 0;
  const sourceShare = Number(fields[col.unplanned_share_pct]);
  const fireSeason = fields[col.season];

  rows.push({
    state_code: fields[col.state_code],
    state_name: fields[col.state_name],
    fire_season: fireSeason,
    season_order: seasonOrder.get(fireSeason) || "",
    planned_burned_cells: planned,
    unplanned_burned_cells: unplanned,
    total_burned_cells: total,
    unplanned_share_pct: Number.isFinite(sourceShare) ? sourceShare : unplannedShare,
    planned_label: compactCount(planned),
    unplanned_label: compactCount(unplanned),
    total_label: compactCount(total),
    unplanned_share_label: `${Math.round(Number.isFinite(sourceShare) ? sourceShare : unplannedShare)}%`,
    southeast_focus: ["NSW", "VIC", "ACT", "SA"].includes(fields[col.state_code]) ? "Yes" : "No"
  });
}

rows.sort((a, b) => {
  if (a.state_code !== b.state_code) return a.state_code.localeCompare(b.state_code);
  return Number(a.season_order) - Number(b.season_order);
});

const outputHeaders = [
  "state_code",
  "state_name",
  "fire_season",
  "season_order",
  "planned_burned_cells",
  "unplanned_burned_cells",
  "total_burned_cells",
  "unplanned_share_pct",
  "planned_label",
  "unplanned_label",
  "total_label",
  "unplanned_share_label",
  "southeast_focus"
];

const csv = [
  outputHeaders.join(","),
  ...rows.map((row) => outputHeaders.map((header) => csvEscape(row[header])).join(","))
].join("\n");

fs.writeFileSync(outputPath, csv);

console.log(`Wrote ${rows.length} state-season rows to ${outputPath}`);
console.log("Preview:");
console.log(csv.split("\n").slice(0, 9).join("\n"));
