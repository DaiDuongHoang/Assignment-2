// File paths for the Vega-Lite JSON specifications
const fireHotspotsSpec = "js/map_fire_hotspots.vg.json?v=20260520_v6";
const streamgraphSpec = "js/streamgraph.vg.json?v=20260520_v6";

// Embed the Fire.csv hotspot map (Row 1)
vegaEmbed('#vis-fire-hotspots', fireHotspotsSpec, { "actions": false }).then(function(result) {
    console.log("Fire hotspots map loaded successfully");
    
    const view = result.view;
    
    // Function to calculate and update zoom target dynamically
    function updateZoom(regionName) {
        let center = [134, -28.5];
        let scale = 680;
        
        if (regionName === 'Southeast') {
            center = [147, -37];
            scale = 2200;
        } else if (regionName === 'Southwest') {
            center = [120, -32];
            scale = 2400;
        } else if (regionName === 'North') {
            center = [134, -17];
            scale = 1400;
        }
        
        console.log("Zooming to", regionName, "- center:", center, "scale:", scale);
        
        view.signal('zoom_center', center)
            .signal('zoom_scale', scale)
            .runAsync()
            .catch(console.error);
    }
    
    // 1. Listen to changes on the 'zoom_region' signal (triggers on clicks)
    view.addSignalListener('zoom_region', function(name, value) {
        console.log("zoom_region signal changed:", value);
        let region = 'All';
        
        if (value) {
            if (typeof value === 'string') {
                region = value;
            } else if (value.region) {
                region = Array.isArray(value.region) ? value.region[0] : value.region;
            } else if (Array.isArray(value) && value.length > 0) {
                const entry = value[0];
                if (entry && entry.values && entry.values.length > 0) {
                    region = entry.values[0];
                } else if (entry && entry.region) {
                    region = Array.isArray(entry.region) ? entry.region[0] : entry.region;
                }
            }
        }
        
        updateZoom(region);
    });
    
    // 2. Listen to changes on the dropdown signal directly for absolute robustness
    try {
        view.addSignalListener('zoom_region_region', function(name, value) {
            console.log("zoom_region_region dropdown signal changed:", value);
            updateZoom(value || 'All');
        });
    } catch (e) {
        console.warn("No zoom_region_region signal found in compiled spec:", e);
    }
    
}).catch(console.error);

// Embed the streamgraph (Row 2)
vegaEmbed('#vis-horizon', streamgraphSpec, { "actions": false }).then(function(result) {
    console.log("Streamgraph loaded successfully");
}).catch(console.error);
