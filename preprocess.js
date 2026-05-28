const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

try {
    const excelPath = './data/ICA-Historical-Normalised-Catastrophe-Master-Updated-2026_02.xlsx';
    console.log(`Loading Excel workbook from: ${excelPath}`);
    const workbook = xlsx.readFile(excelPath);
    
    let targetSheetName = null;
    let targetSheet = null;
    let headerRowIndex = -1;
    let headers = [];

    // 1. Detect the worksheet containing the required ICA columns
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // Scan up to 50 rows to find our header row
        for (let i = 0; i < Math.min(50, rows.length); i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            // Standardise raw cell strings for checking
            const cellStrings = row.map(cell => cell !== null && cell !== undefined ? String(cell).trim().toUpperCase() : '');
            
            const hasType = cellStrings.includes('TYPE');
            const hasYear = cellStrings.includes('YEAR');
            const hasEventName = cellStrings.includes('EVENT NAME');
            const hasLoss = cellStrings.includes('NORMALISED LOSS VALUE (2022)');
            
            if (hasType && hasYear && hasEventName && hasLoss) {
                targetSheetName = sheetName;
                targetSheet = sheet;
                headerRowIndex = i;
                headers = row.map(cell => cell !== null && cell !== undefined ? String(cell).trim() : '');
                break;
            }
        }
        if (targetSheet) break;
    }

    if (!targetSheet) {
        throw new Error("Could not find a worksheet containing the required columns: Type, Year, Event Name, and NORMALISED LOSS VALUE (2022).");
    }

    console.log(`Detected target worksheet: "${targetSheetName}" at header row index: ${headerRowIndex}`);
    console.log("Sheet Columns:", headers);

    // 2. Build column indices mapping
    const colIndices = {
        type: headers.indexOf('Type'),
        year: headers.indexOf('Year'),
        event_name: headers.indexOf('Event Name'),
        state: headers.indexOf('State'),
        original_loss: headers.indexOf('ORIGINAL LOSS VALUE'),
        normalised_loss: headers.indexOf('NORMALISED LOSS VALUE (2022)'),
        total_claims: headers.indexOf('TOTAL CLAIMS RECEIVED')
    };

    console.log("Column Mapping Indices:", colIndices);

    // Read all rows below header row
    const rows = xlsx.utils.sheet_to_json(targetSheet, { header: 1 });
    const dataRows = rows.slice(headerRowIndex + 1);
    const cleanedRecords = [];

    // Helper to clean numeric values carefully
    function cleanNumeric(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        
        // If string, strip $, commas, spaces
        const str = String(val).replace(/[\$,\s]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    }

    // 3. Process and filter rows
    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        const type = row[colIndices.type] !== undefined ? String(row[colIndices.type]).trim() : '';
        const year = cleanNumeric(row[colIndices.year]);
        const event_name = row[colIndices.event_name] !== undefined ? String(row[colIndices.event_name]).trim() : '';
        const state = row[colIndices.state] !== undefined ? String(row[colIndices.state]).trim() : '';
        
        const original_loss = cleanNumeric(row[colIndices.original_loss]);
        const normalised_loss = cleanNumeric(row[colIndices.normalised_loss]);
        const total_claims = cleanNumeric(row[colIndices.total_claims]);

        // 4. Filtering: type == "Bushfire", year valid, normalised_loss valid and > 0
        if (type.toLowerCase() === 'bushfire' && year !== null && normalised_loss !== null && normalised_loss > 0) {
            
            // 5. Derived Fields
            const loss_billion = normalised_loss / 1000000000;
            const loss_per_claim = (total_claims !== null && total_claims > 0) ? normalised_loss / total_claims : null;
            const claims_available = total_claims !== null && total_claims > 0;
            const bubble_size_metric = claims_available ? total_claims : 1000;
            
            // Regex match: /2019\/20|2019-20|Black Summer/i
            const is_black_summer = /2019\/20|2019-20|Black Summer/i.test(event_name);
            
            let severity_category = 'Low';
            if (loss_billion >= 2.0) {
                severity_category = 'Catastrophic';
            } else if (loss_billion >= 1.0) {
                severity_category = 'High';
            } else if (loss_billion >= 0.25) {
                severity_category = 'Medium';
            }

            // 6. Preformatted Tooltip Fields
            const loss_billion_label = loss_billion >= 0.1 
                ? `$${loss_billion.toFixed(2)}B` 
                : `$${loss_billion.toFixed(3)}B`;
            const original_loss_label = original_loss !== null 
                ? `$${Math.round(original_loss).toLocaleString()}` 
                : 'N/A';
            const claims_label = total_claims !== null 
                ? total_claims.toLocaleString() 
                : 'No claims data';
            const loss_per_claim_label = loss_per_claim !== null 
                ? `$${Math.round(loss_per_claim).toLocaleString()}` 
                : 'N/A';

            cleanedRecords.push({
                type,
                year,
                event_name,
                state,
                original_loss,
                normalised_loss,
                total_claims,
                loss_billion,
                loss_per_claim,
                claims_available,
                bubble_size_metric,
                is_black_summer,
                severity_category,
                loss_billion_label,
                original_loss_label,
                claims_label,
                loss_per_claim_label
            });
        }
    }

    // Sort bushfire events by normalised loss descending
    cleanedRecords.sort((a, b) => b.normalised_loss - a.normalised_loss);

    // Assign rank, event_label, and custom label offsets for top 5 events
    cleanedRecords.forEach((record, index) => {
        const loss_rank = index + 1;
        const is_top_event = loss_rank <= 5;
        const event_label = is_top_event ? record.event_name : "";
        const display_label = event_label === "Bushfire" ? `${record.year} Bushfire` : event_label;

        // 7. Custom Label Positioning fields to prevent text collisions
        let label_dx = 12;
        let label_dy = -10;
        let label_align = "left";

        if (is_top_event) {
            // Apply customized offsets based on rank to stagger text positions
            if (loss_rank === 1) { // 1967 Tasmanian Bushfire (generic name)
                label_dx = 15;
                label_dy = -8;
                label_align = "left";
            } else if (loss_rank === 2) { // Ash Wednesday 1983
                label_dx = 15;
                label_dy = -8;
                label_align = "left";
            } else if (loss_rank === 3) { // Black Saturday 2009 (place slightly above and to the right)
                label_dx = 15;
                label_dy = -12;
                label_align = "left";
            } else if (loss_rank === 4) { // 2019/20 Bushfires (place slightly below and to the left)
                label_dx = -15;
                label_dy = 15;
                label_align = "right";
            } else if (loss_rank === 5) { // Canberra Bushfire 2003
                label_dx = 15;
                label_dy = -8;
                label_align = "left";
            }
        }

        record.loss_rank = loss_rank;
        record.is_top_event = is_top_event;
        record.event_label = event_label;
        record.display_label = display_label;
        record.label_dx = label_dx;
        record.label_dy = label_dy;
        record.label_align = label_align;
    });

    console.log(`\nSuccessfully processed ${cleanedRecords.length} bushfire records.`);
    console.log("Top 5 Bushfire Catastrophes by Normalized Insured Loss:");
    cleanedRecords.slice(0, 5).forEach(r => {
        console.log(`Rank ${r.loss_rank}: ${r.event_name} (${r.year}) - Loss: ${r.loss_billion_label}, Claims: ${r.claims_label}`);
    });

    // Write to file
    const outputPath = './data/ica_bushfire_cleaned.json';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(cleanedRecords, null, 2), 'utf-8');
    console.log(`Saved cleaned data to: ${outputPath}`);

} catch (error) {
    console.error("Critical error in preprocessing script:", error);
    process.exit(1);
}
