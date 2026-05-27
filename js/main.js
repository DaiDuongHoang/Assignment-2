const fireHotspotsSpec = "js/map_fire_hotspots.vg.json?v=20260526_v13";
const streamgraphSpec = "js/streamgraph.vg.json?v=20260526_v13";
const economicShockSpec = "js/economic_shock.vg.json?v=20260527_economic_no_year";

// Embed the Fire.csv hotspot map (Row 1)
vegaEmbed("#vis-fire-hotspots", fireHotspotsSpec, { "actions": false })
  .then(function (result) {
    console.log("Fire hotspots map loaded successfully");

    const view = result.view;

    // Function to calculate and update zoom target dynamically
    function updateZoom(regionName) {
      let center = [134, -28.5];
      let scale = 600;

      if (regionName === "Southeast") {
        center = [147, -37];
        scale = 2200;
      } else if (regionName === "Southwest") {
        center = [120, -32];
        scale = 2400;
      } else if (regionName === "North") {
        center = [134, -17];
        scale = 1400;
      }

      console.log(
        "Programmatic zoom - region:",
        regionName,
        "center:",
        center,
        "scale:",
        scale
      );

      // Update both signals so they propagate to the map projection and the HTML controls!
      view
        .signal("center_to", center)
        .signal("zoom_level", scale)
        .runAsync()
        .catch(console.error);
    }

    // 1. Listen to changes on the 'zoom_region' signal (triggers when user clicks annotations on the map)
    view.addSignalListener("zoom_region", function (name, value) {
      console.log("zoom_region click signal changed:", value);
      let region = "All";

      if (value) {
        if (typeof value === "string") {
          region = value;
        } else if (value.region) {
          region = Array.isArray(value.region) ? value.region[0] : value.region;
        } else if (Array.isArray(value) && value.length > 0) {
          const entry = value[0];
          if (entry && entry.values && entry.values.length > 0) {
            region = entry.values[0];
          } else if (entry && entry.region) {
            region = Array.isArray(entry.region)
              ? entry.region[0]
              : entry.region;
          }
        }
      }

      updateZoom(region);
    });

    // 2. Listen to changes on the 'center_to' signal (triggers when user manually interacts with the dropdown)
    view.addSignalListener("center_to", function (name, value) {
      console.log("center_to dropdown signal changed:", value);
      let region = "All";
      let scale = 600;

      if (Array.isArray(value) && value.length === 2) {
        const [lon, lat] = value;
        if (lon === 147 && lat === -37) {
          region = "Southeast";
          scale = 5000;
        } else if (lon === 120 && lat === -32) {
          region = "Southwest";
          scale = 3500;
        } else if (lon === 134 && lat === -17) {
          region = "North";
          scale = 1400;
        }
      }

      // Update the zoom slider value to match the region default scale
      if (view.signal("zoom_level") !== scale) {
        view.signal("zoom_level", scale);
      }

      // Update the highlight selection to match the active region
      if (view.signal("zoom_region_region") !== region) {
        view.signal("zoom_region_region", region === "All" ? null : region);
      }

      view.runAsync().catch(console.error);
    });
  })
  .catch(console.error);

// Embed the streamgraph (Row 2)
vegaEmbed('#vis-horizon', streamgraphSpec, { "actions": false }).then(function(result) {
    console.log("Streamgraph loaded successfully");
}).catch(console.error);

// Embed the Economic Shock Timeline (Row 4)
vegaEmbed('#vis-economic-shock', economicShockSpec, { "actions": false }).then(function(result) {
    console.log("Economic Shock Timeline loaded successfully");
}).catch(console.error);
