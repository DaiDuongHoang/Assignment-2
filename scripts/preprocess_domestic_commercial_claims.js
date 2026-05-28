const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const inputPath = path.join('data', 'ICA-Historical-Normalised-Catastrophe-Master-Updated-2026_02.xlsx');
const outputPath = path.join('data', 'domestic_commercial_bushfire_claims.json');

const domesticColumns = [
  'Domestic Building Claims',
  'Domestic Content Claims',
  'Domestic Motor Claims',
  'Domestic Other Claims'
];

const commercialColumns = [
  'Commercial Property Claims',
  'Commercial motor',
  'Commercial BI Claims',
  'Commercial Other Claims',
  'Commercial Crop Claims'
];

function cleanNumeric(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const number = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function formatCount(value) {
  return Math.round(value).toLocaleString('en-AU');
}

function formatCurrency(value) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  const billions = value / 1000000000;
  return `$${billions.toFixed(2)}B`;
}

function detectSheetAndHeader(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 60); rowIndex += 1) {
      const headers = rows[rowIndex].map((cell) => String(cell).trim());
      const requiredColumns = [
        'Type',
        'Year',
        'Event Name',
        'TOTAL CLAIMS RECEIVED',
        'NORMALISED LOSS VALUE (2022)',
        ...domesticColumns,
        ...commercialColumns
      ];

      if (requiredColumns.every((column) => headers.includes(column))) {
        return { sheetName, sheet, rows, headerRowIndex: rowIndex, headers };
      }
    }
  }

  throw new Error('Could not find ICA worksheet with domestic and commercial claim-count fields.');
}

try {
  const workbook = xlsx.readFile(inputPath);
  const { sheetName, rows, headerRowIndex, headers } = detectSheetAndHeader(workbook);
  const columnIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

  const records = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const type = String(row[columnIndex.Type] ?? '').trim();
    if (type.toLowerCase() !== 'bushfire') {
      continue;
    }

    const domesticParts = domesticColumns.map((column) => cleanNumeric(row[columnIndex[column]]));
    const commercialParts = commercialColumns.map((column) => cleanNumeric(row[columnIndex[column]]));

    // Keep only rows with explicit component values, so the split is not inferred from total claims.
    if ([...domesticParts, ...commercialParts].some((value) => value === null)) {
      continue;
    }

    const domesticTotal = domesticParts.reduce((sum, value) => sum + value, 0);
    const commercialTotal = commercialParts.reduce((sum, value) => sum + value, 0);
    const totalDomesticCommercial = domesticTotal + commercialTotal;

    if (totalDomesticCommercial <= 0) {
      continue;
    }

    const year = cleanNumeric(row[columnIndex.Year]);
    const totalClaims = cleanNumeric(row[columnIndex['TOTAL CLAIMS RECEIVED']]);
    const normalisedLoss = cleanNumeric(row[columnIndex['NORMALISED LOSS VALUE (2022)']]);
    const domesticShare = domesticTotal / totalDomesticCommercial;
    const commercialShare = commercialTotal / totalDomesticCommercial;
    const rawEventName = String(row[columnIndex['Event Name']] ?? '').trim();
    const eventName = rawEventName || 'Bushfire';

    records.push({
      year,
      event_name: eventName,
      display_label: year ? `${eventName} (${year})` : eventName,
      state: String(row[columnIndex.State] ?? '').trim() || 'N/A',
      domestic_total: domesticTotal,
      commercial_total: commercialTotal,
      total_domestic_commercial: totalDomesticCommercial,
      total_claims: totalClaims,
      normalised_loss: normalisedLoss,
      domestic_share: domesticShare,
      commercial_share: commercialShare,
      domestic_share_signed: -domesticShare * 100,
      commercial_share_signed: commercialShare * 100,
      domestic_claims_label: formatCount(domesticTotal),
      commercial_claims_label: formatCount(commercialTotal),
      total_claims_label: formatCount(totalDomesticCommercial),
      workbook_total_claims_label: totalClaims !== null ? formatCount(totalClaims) : 'N/A',
      domestic_share_label: `${(domesticShare * 100).toFixed(1)}%`,
      commercial_share_label: `${(commercialShare * 100).toFixed(1)}%`,
      normalised_loss_label: formatCurrency(normalisedLoss)
    });
  }

  records
    .sort((a, b) => b.total_domestic_commercial - a.total_domestic_commercial)
    .forEach((record, index) => {
      record.sort_order = index + 1;
    });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf8');

  console.log(`Read: ${inputPath}`);
  console.log(`Worksheet: ${sheetName}`);
  console.log(`Saved ${records.length} bushfire rows with domestic/commercial claim splits to: ${outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
