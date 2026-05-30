const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "..", "data", "australian_annual_bushfire_area_(19902020).csv");
const outputPath = path.join(__dirname, "..", "data", "annual_burned_area_extremes.csv");

const categories = [
  {
    key: "Tropical_savanna_woodlands",
    label: "Tropical Savanna Woodlands"
  },
  {
    key: "Arid_semi_arid_rangelands",
    label: "Arid & Semi-Arid Rangelands"
  },
  {
    key: "Temperate_forest_wildfires",
    label: "Temperate Forest Wildfires"
  },
  {
    key: "Temperate_forest_hazard_reduction",
    label: "Hazard Reduction Burns"
  }
];

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return NaN;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

const sourceRows = parseCsv(fs.readFileSync(inputPath, "utf8"));

const annualRows = sourceRows.map((row) => {
  const categoryValues = categories.map((category) => ({
    category: category.label,
    area: Number(row[category.key])
  }));

  const annualTotal = categoryValues.reduce((sum, value) => sum + value.area, 0);
  const dominantCategory = categoryValues.reduce((best, value) =>
    value.area > best.area ? value : best
  ).category;

  return {
    year: Number(row.Year),
    annual_total_burned_area: annualTotal,
    dominant_category: dominantCategory
  };
});

const totalsAscending = annualRows
  .map((row) => row.annual_total_burned_area)
  .sort((a, b) => a - b);

const p75 = quantile(totalsAscending, 0.75);
const p90 = quantile(totalsAscending, 0.9);

const rankedRows = annualRows
  .slice()
  .sort((a, b) => b.annual_total_burned_area - a.annual_total_burned_area || a.year - b.year)
  .map((row, index) => ({
    ...row,
    rank_by_total_burned_area: index + 1,
    percentile_band:
      row.annual_total_burned_area > p90
        ? "Extreme years"
        : row.annual_total_burned_area >= p75
          ? "High-burn years"
          : "Typical years"
  }))
  .sort((a, b) => a.year - b.year);

const headers = [
  "year",
  "annual_total_burned_area",
  "rank_by_total_burned_area",
  "percentile_band",
  "dominant_category"
];

const csv = [
  headers.join(","),
  ...rankedRows.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        return typeof value === "number" && header === "annual_total_burned_area"
          ? value.toFixed(2)
          : csvEscape(value);
      })
      .join(",")
  )
].join("\n");

fs.writeFileSync(outputPath, `${csv}\n`);

console.log(`Read ${sourceRows.length} annual rows from ${path.basename(inputPath)}.`);
console.log(`Wrote ${rankedRows.length} annual rows to ${outputPath}.`);
console.log(`75th percentile threshold: ${p75.toFixed(2)} M ha`);
console.log(`90th percentile threshold: ${p90.toFixed(2)} M ha`);
console.table(
  rankedRows
    .slice()
    .sort((a, b) => a.rank_by_total_burned_area - b.rank_by_total_burned_area)
    .slice(0, 8)
    .map((row) => ({
      year: row.year,
      total_mha: row.annual_total_burned_area.toFixed(0),
      rank: row.rank_by_total_burned_area,
      band: row.percentile_band,
      dominant: row.dominant_category
    }))
);
