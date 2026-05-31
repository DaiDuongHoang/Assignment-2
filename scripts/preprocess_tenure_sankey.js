/*
 * Preprocess Fire_For16-21 attributes into a precomputed alluvial / Sankey
 * layout: FOR_TEN (tenure) -> FOR_CATEGO (forest category) -> FOR_BURN_T
 * (burn outcome). Flow = COUNT (a burned/forest raster-cell area proxy).
 *
 * Full-path continuity: every flow is keyed on the complete
 * tenure|category|outcome triple, then the three columns of node geometry are
 * derived from those triples (no independent left/right summaries).
 *
 * Four precomputed views are emitted so the page can toggle without recompute:
 *   burned-simplified  (DEFAULT)  burned outcomes only, 2 categories
 *   burned-detailed               burned outcomes only, 3 categories
 *   all-simplified                includes "Not burnt", 2 categories
 *   all-detailed                  includes "Not burnt", 3 categories
 *
 * Design choices for readability / honesty:
 *   - "Not Defined" (ND) tenure is hidden (0.03% of burned area, a hairline);
 *     documented in the chart data note instead.
 *   - Non-forest cells are excluded (this is a forest flow).
 *   - Tiny nodes/flows get a MINIMUM pixel thickness so they stay visible and
 *     hoverable; tooltips always carry the TRUE cell count and share, so the
 *     visual floor never misrepresents magnitude.
 *   - Tenure sorted by burned/area total descending in each view.
 *   - Outcomes sorted Unplanned -> Both -> Planned -> Not burnt.
 *
 * Output: data/tenure_sankey_nodes.json  (flat, each row tagged with viewKey)
 *         data/tenure_sankey_links.json  (flat, each row tagged with viewKey)
 */

const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "..", "Datasets", "Fire_For16-21_Attributes.csv");
const nodesOut = path.join(__dirname, "..", "data", "tenure_sankey_nodes.json");
const linksOut = path.join(__dirname, "..", "data", "tenure_sankey_links.json");

// ---- Canvas geometry (larger + airier than v1) ----------------------------
const W = 1040;
const H = 620;
const TOP = 40;
const BOT = 30;
const PAD = 26; // generous vertical gap between nodes in a column
const COL_W = [30, 110, 30]; // custom widths per column to allow outer labels room
const COL_X = [160, 450, 820]; // left edge of each column's node
const MIN_NODE_H = 7; // floor so tiny nodes stay visible/hoverable
const MIN_LINK_H = 3; // floor so thin flows are not hairlines

// ---- Recoding --------------------------------------------------------------
const tenureMap = {
  OCL: "Crown Land",
  PRIV: "Private",
  LEASE: "Leasehold",
  NCR: "Nature Conservation",
  MUF: "Multiple-Use Forest"
  // ND intentionally omitted -> hidden
};
const outcomeMap = {
  "Unplanned burns only": "Unplanned only",
  "Planned and Unplanned burns": "Both burns",
  "Planned burns only": "Planned only",
  "Forest not burnt": "Not burnt"
};
const simplifyCategory = (c) => (c === "Native forest" ? "Native forest" : "Plantation / other forest");

// Outcome order + colours (outcome carries the story)
const outcomeOrder = ["Unplanned only", "Both burns", "Planned only", "Not burnt"];
const outcomeColor = {
  "Unplanned only": "#B5202B",
  "Both burns": "#E8842A",
  "Planned only": "#6A994E",
  "Not burnt": "#C9C0B2"
};
// Muted tenure + category palettes
const tenureColor = {
  Leasehold: "#B08968",
  Private: "#9C6644",
  "Nature Conservation": "#7F5539",
  "Multiple-Use Forest": "#C8A47E",
  "Crown Land": "#DDB892"
};
const categoryColor = {
  "Native forest": "#6E8B4E",
  "Plantation / other forest": "#A7B889",
  "Commercial plantation": "#90A955",
  "Other forest": "#B6C197"
};

// ---------------------------------------------------------------------------
function fmt(v) {
  return v.toLocaleString("en-US");
}
function fmtM(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

// ---- Read + aggregate full paths -------------------------------------------
const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter((l) => l.length);
const HEAD = lines[0].split(",");
const iC = HEAD.indexOf("COUNT"),
  iT = HEAD.indexOf("FOR_TEN"),
  iCat = HEAD.indexOf("FOR_CATEGO"),
  iB = HEAD.indexOf("FOR_BURN_T");

// paths[ten][cat][burn] = count   (raw categories + raw burn types, forest only, ND removed)
const paths = [];
for (let k = 1; k < lines.length; k++) {
  const p = lines[k].split(",");
  const ten = (p[iT] || "").trim();
  const cat = (p[iCat] || "").trim();
  const burn = (p[iB] || "").trim();
  let c = parseInt(p[iC], 10) || 0;
  if (!ten || !cat || !burn) continue;
  if (cat === "Non-forest") continue;
  if (ten === "ND") continue; // hidden hairline tenure
  if (!tenureMap[ten]) continue;
  paths.push({ ten: tenureMap[ten], cat, burn: outcomeMap[burn] || burn, count: c });
}

// ---- Build one view --------------------------------------------------------
function buildView({ burnedOnly, simplified }) {
  // 1. aggregate full triples for this view
  const agg = {};
  for (const r of paths) {
    if (burnedOnly && r.burn === "Not burnt") continue;
    const cat = simplified ? simplifyCategory(r.cat) : r.cat;
    const key = r.ten + "||" + cat + "||" + r.burn;
    agg[key] = (agg[key] || 0) + r.count;
  }
  const triples = Object.entries(agg).map(([k, v]) => {
    const [ten, cat, burn] = k.split("||");
    return { ten, cat, burn, value: v };
  });
  const total = triples.reduce((a, t) => a + t.value, 0);

  // 2. node totals per column
  const tenTot = {},
    catTot = {},
    burnTot = {};
  triples.forEach((t) => {
    tenTot[t.ten] = (tenTot[t.ten] || 0) + t.value;
    catTot[t.cat] = (catTot[t.cat] || 0) + t.value;
    burnTot[t.burn] = (burnTot[t.burn] || 0) + t.value;
  });

  // 3. column orders
  const tenOrder = Object.keys(tenTot).sort((a, b) => tenTot[b] - tenTot[a]);
  const catOrder = Object.keys(catTot).sort((a, b) => catTot[b] - catTot[a]);
  const burnOrder = outcomeOrder.filter((o) => burnTot[o]);

  // 4. shared value->pixel scale with min-thickness floors.
  //    We solve per column: heights = max(MIN_NODE_H, value*ky), gaps fixed.
  //    Pick ky so the tallest column fits exactly.
  function columnHeight(order, totals, ky) {
    const hs = order.map((k) => Math.max(MIN_NODE_H, totals[k] * ky));
    return hs.reduce((a, b) => a + b, 0) + (order.length - 1) * PAD;
  }
  const avail = H - TOP - BOT;
  // initial ky ignoring floors
  let ky = (avail - (Math.max(tenOrder.length, catOrder.length, burnOrder.length) - 1) * PAD) / total;
  // iterate: floors steal space from big nodes, so shrink ky until all columns fit
  for (let iter = 0; iter < 40; iter++) {
    const maxH = Math.max(
      columnHeight(tenOrder, tenTot, ky),
      columnHeight(catOrder, catTot, ky),
      columnHeight(burnOrder, burnTot, ky)
    );
    if (maxH <= avail) break;
    ky *= (avail / maxH) * 0.999;
  }

  function layoutColumn(order, totals, colIndex, colorMap, isOutcome) {
    const hs = order.map((k) => Math.max(MIN_NODE_H, totals[k] * ky));
    const blockH = hs.reduce((a, b) => a + b, 0) + (order.length - 1) * PAD;
    let y = TOP + (avail - blockH) / 2;
    const nodes = {};
    order.forEach((key, i) => {
      const h = hs[i];
      nodes[key] = {
        name: key,
        column: colIndex,
        x: COL_X[colIndex],
        x2: COL_X[colIndex] + COL_W[colIndex],
        y: y,
        y2: y + h,
        value: totals[key],
        color: isOutcome ? outcomeColor[key] : colorMap[key] || "#C8A47E",
        outOff: y,
        inOff: y
      };
      y += h + PAD;
    });
    return nodes;
  }

  const tenNodes = layoutColumn(tenOrder, tenTot, 0, tenureColor, false);
  const catNodes = layoutColumn(catOrder, catTot, 1, categoryColor, false);
  const burnNodes = layoutColumn(burnOrder, burnTot, 2, null, true);

  // 5. links. Split triples into the two stages but keep the FULL triple on
  //    each ribbon for tooltip + path-highlight continuity.
  function makeStage(getSrc, getTgt, srcNodes, tgtNodes, colorByTarget) {
    // group identical src->tgt (collapsing the third dimension) but remember members
    const grouped = {};
    triples.forEach((t) => {
      const s = getSrc(t),
        g = getTgt(t);
      const key = s + "||" + g;
      (grouped[key] = grouped[key] || { s, g, value: 0, members: [] }).value += t.value;
      grouped[key].members.push(t);
    });
    const arr = Object.values(grouped);
    // assign source offsets (ordered by target position) and target offsets
    const bySrc = {};
    arr.forEach((l) => (bySrc[l.s] = bySrc[l.s] || []).push(l));
    Object.keys(bySrc).forEach((s) => {
      bySrc[s]
        .sort((a, b) => tgtNodes[a.g].y - tgtNodes[b.g].y)
        .forEach((l) => {
          l.h = Math.max(MIN_LINK_H, l.value * ky);
          l.sy = srcNodes[s].outOff;
          srcNodes[s].outOff += l.h;
        });
    });
    const byTgt = {};
    arr.forEach((l) => (byTgt[l.g] = byTgt[l.g] || []).push(l));
    Object.keys(byTgt).forEach((g) => {
      byTgt[g]
        .sort((a, b) => srcNodes[a.s].y - srcNodes[b.s].y)
        .forEach((l) => {
          l.ty = tgtNodes[g].inOff;
          tgtNodes[g].inOff += l.h;
        });
    });
    return arr.map((l) => {
      const sx = srcNodes[l.s].x2;
      const tx = tgtNodes[l.g].x;
      const cpx = (sx + tx) / 2;
      const sy0 = l.sy,
        sy1 = l.sy + l.h,
        ty0 = l.ty,
        ty1 = l.ty + l.h;
      const d =
        `M${sx},${sy0}` +
        `C${cpx},${sy0} ${cpx},${ty0} ${tx},${ty0}` +
        `L${tx},${ty1}` +
        `C${cpx},${ty1} ${cpx},${sy1} ${sx},${sy1}Z`;
      return {
        stage: srcNodes === tenNodes ? 1 : 2,
        source: l.s,
        target: l.g,
        path: d,
        value: l.value,
        valueLabel: fmtM(l.value),
        valueFull: fmt(l.value),
        share: +((100 * l.value) / total).toFixed(1),
        fill: colorByTarget ? tgtNodes[l.g].color : srcNodes[l.s].color
      };
    });
  }

  // stage 1 tenure->category coloured by tenure (muted); stage 2 category->outcome coloured by outcome (story)
  const links1 = makeStage((t) => t.ten, (t) => t.cat, tenNodes, catNodes, false);
  const links2 = makeStage((t) => t.cat, (t) => t.burn, catNodes, burnNodes, true);

  // 6. emit node objects with label geometry. Outer columns label outside.
  //    Middle column: label inside if tall enough, else outside-right.
  const MIN_INSIDE = 30;
  function emitNodes(nodes, colIndex) {
    const list = Object.values(nodes);
    const out = list.map((n) => {
      const h = n.y2 - n.y;
      let labelX, align, outside;
      if (colIndex === 0) {
        labelX = n.x - 12;
        align = "right";
        outside = true;
      } else if (colIndex === 2) {
        labelX = n.x2 + 12;
        align = "left";
        outside = true;
      } else if (h >= MIN_INSIDE) {
        labelX = (n.x + n.x2) / 2;
        align = "center";
        outside = false;
      } else {
        labelX = n.x2 + 12;
        align = "left";
        outside = true;
      }
      let labelVal = n.name;
      if (colIndex === 1 && !outside) {
        if (n.name === "Plantation / other forest") {
          labelVal = ["Plantation /", "other forest"];
        } else if (n.name === "Commercial plantation") {
          labelVal = ["Commercial", "plantation"];
        }
      }
      return {
        name: n.name,
        // wrap long native-forest / plantation labels onto two lines for the middle column
        label: labelVal,
        column: colIndex,
        x: n.x,
        x2: n.x2,
        y: +n.y.toFixed(2),
        y2: +n.y2.toFixed(2),
        value: n.value,
        valueLabel: fmtM(n.value),
        valueFull: fmt(n.value),
        share: +((100 * n.value) / total).toFixed(1),
        color: n.color,
        labelX: +labelX.toFixed(2),
        labelY: +((n.y + n.y2) / 2).toFixed(2),
        labelAlign: align,
        labelOutside: outside
      };
    });
    return out;
  }

  // de-collide outside labels within a column (right-aligned outer / pushed middle)
  function decollide(nodeArr) {
    const MINGAP = 15;
    const groups = {};
    nodeArr.forEach((n) => {
      const g = n.labelAlign + "@" + Math.round(n.labelX);
      (groups[g] = groups[g] || []).push(n);
    });
    Object.values(groups).forEach((arr) => {
      arr.sort((a, b) => a.labelY - b.labelY);
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].labelY - arr[i - 1].labelY < MINGAP) arr[i].labelY = arr[i - 1].labelY + MINGAP;
      }
    });
  }

  const nodes = []
    .concat(emitNodes(tenNodes, 0))
    .concat(emitNodes(catNodes, 1))
    .concat(emitNodes(burnNodes, 2));
  decollide(nodes);

  return { nodes, links: links1.concat(links2), total };
}

// ---- Emit all four views as flat, viewKey-tagged arrays --------------------
const viewDefs = [
  ["burned-simplified", { burnedOnly: true, simplified: true }],
  ["burned-detailed", { burnedOnly: true, simplified: false }],
  ["all-simplified", { burnedOnly: false, simplified: true }],
  ["all-detailed", { burnedOnly: false, simplified: false }]
];

const allNodes = [];
const allLinks = [];
viewDefs.forEach(([key, opts]) => {
  const v = buildView(opts);
  v.nodes.forEach((n) => allNodes.push(Object.assign({ viewKey: key }, n)));
  v.links.forEach((l) => allLinks.push(Object.assign({ viewKey: key }, l)));
  console.log(key.padEnd(20), "nodes", v.nodes.length, "links", v.links.length, "total", fmt(v.total));
});

fs.writeFileSync(nodesOut, JSON.stringify(allNodes));
fs.writeFileSync(linksOut, JSON.stringify(allLinks));
console.log("Wrote", path.relative(process.cwd(), nodesOut), "and", path.relative(process.cwd(), linksOut));
