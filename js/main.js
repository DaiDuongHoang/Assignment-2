// File paths for the Vega-Lite JSON specifications
const fireHotspotsSpec = "js/map_fire_hotspots.vg.json";
const mapSpec = "js/map_bushfire.vg.json";
const barSpec = "js/bar_state.vg.json";
const timelineSpec = "js/timeline_bushfire.vg.json";

// Embed the Fire.csv hotspot map (Row 1)
vegaEmbed('#vis-fire-hotspots', fireHotspotsSpec, { "actions": false }).then(function(result) {
    console.log("Fire hotspots map loaded successfully");
}).catch(console.error);

// Embed the Fire History map (Row 2)
vegaEmbed('#vis-map', mapSpec, { "actions": false }).then(function(result) {
    console.log("Fire history map loaded successfully");
}).catch(console.error);

// Embed the bar visualization (Row 3 left)
vegaEmbed('#vis-bar', barSpec, { "actions": false }).then(function(result) {
    console.log("Bar chart loaded successfully");
}).catch(console.error);

// Embed the timeline visualization (Row 3 right)
vegaEmbed('#vis-timeline', timelineSpec, { "actions": false }).then(function(result) {
    console.log("Timeline loaded successfully");
}).catch(console.error);
