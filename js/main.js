const fireHotspotsSpec = "js/map_fire_hotspots.vg.json?v=20260531_savanna_label_v3";
const stateBivariateBurnMapSpec = "js/state_bivariate_burn_map.vg.json?v=20260531_color_ramp_v23";
const fireSeasonCalendarSpec = "js/fire_season_calendar.vg.json?v=20260531_calendar_v2";
const fireRiskTrajectoriesSpec = "js/fire_risk_trajectories.vg.json?v=20260530_state_profiles_v14";
const streamgraphSpec = "js/streamgraph.vg.json?v=20260531_label_v16";
const annualBurnedAreaExtremesSpec = "js/annual_burned_area_extremes.vg.json?v=20260531_shift_v17";
const bushfireTimelineSpec = "js/bushfire_event_timeline.vg.json?v=20260529_full_width_v21";

const economicShockSpec = "js/economic_shock.vg.json?v=20260530_compact_v1";
const domesticCommercialClaimsSpec = "js/domestic_commercial_claims.vg.json?v=20260529_legend_hover_v2";
const burnedAreaLossSpec = "js/burned_area_vs_economic_loss.vg.json?v=20260531_fig3d_restore_v4";
const threatenedAnimalsByClassSpec = "js/threatened_animals_by_class.vg.json?v=20260531_fig4b_editorial_v3";

// Embed the Fire.csv hotspot map (Row 1)
vegaEmbed("#vis-fire-hotspots", fireHotspotsSpec, { "actions": false })
  .then(function (result) {
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

      view
        .signal("center_to", center)
        .signal("zoom_level", scale)
        .runAsync()
        .catch(console.error);
    }

    view.addSignalListener("zoom_region", function (name, value) {
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

    view.addSignalListener("center_to", function (name, value) {
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

      if (view.signal("zoom_level") !== scale) {
        view.signal("zoom_level", scale);
      }

      if (view.signal("zoom_region_region") !== region) {
        view.signal("zoom_region_region", region === "All" ? null : region);
      }

      view.runAsync().catch(console.error);
    });
  })
  .catch(console.error);

// Embed the Section 1 burned-area views.
const streamgraphEmbed = vegaEmbed('#vis-horizon', streamgraphSpec, { "actions": false }).catch(function(error) {
  console.error(error);
  return null;
});

const annualBurnedAreaExtremesEmbed = vegaEmbed('#vis-annual-burned-area-extremes', annualBurnedAreaExtremesSpec, {
  "actions": false,
  "renderer": "svg"
}).then(function(result) {
  const view = result.view;
  const target = document.querySelector('#shift-chart-control');
  const bindings = document.querySelector('#vis-annual-burned-area-extremes .vega-bindings');
  if (target && bindings) {
    target.appendChild(bindings);
  }

  const explanatoryNote = document.querySelector('#shift-chart-explanatory-note');
  const legendEl = document.querySelector('.burned-area-extremes-legend');

  const descriptions = {
    'Change from baseline': 'Burned cell counts are used as an area proxy and should not be interpreted as exact hectares. Zero marks no change from the pre-Black Summer average; bars to the right increased in 2019–20, while bars to the left decreased.',
    'Before vs Black Summer': 'Burned cell counts are used as an area proxy and should not be interpreted as exact hectares. Grey points show the pre-Black Summer average; red points show the 2019–20 Black Summer burned-cell total.'
  };

  const legends = {
    'Change from baseline': '<span class="legend-title">Comparison</span><span><i style="background: #B83246;"></i>Increase from baseline</span><span><i style="background: #8E8276;"></i>Decrease from baseline</span>',
    'Before vs Black Summer': '<span class="legend-title">Comparison</span><span><i style="background: #8E8276;"></i>Pre-Black Summer average</span><span><i style="background: #B83246;"></i>2019–20 Black Summer</span>'
  };

  view.addSignalListener('displayMode', function(name, value) {
    if (explanatoryNote && descriptions[value]) {
      explanatoryNote.textContent = descriptions[value];
    }
    if (legendEl && legends[value]) {
      legendEl.innerHTML = legends[value];
    }
  });
  return result;
}).catch(function(error) {
  console.error(error);
  return null;
});

Promise.all([streamgraphEmbed, annualBurnedAreaExtremesEmbed]).then(function(results) {
  // Fig 1B is now a dynamic lollipop/dumbbell hybrid chart; no timeline coordination is required.
});

// Embed the state-level bivariate Black Summer burn map (Section 2)
vegaEmbed('#vis-state-bivariate-burn-map', stateBivariateBurnMapSpec, { "actions": false })
  .then(function(result) {
    const view = result.view;
    const target = document.querySelector('#bivariate-season-control');
    const bindings = document.querySelector('#vis-state-bivariate-burn-map .vega-bindings');
    const descriptions = {
      '2016–17': 'Queensland and Northern Territory dominated burning in 2016–17, with large areas of tropical savanna affected. Unplanned burns remained moderate across the southeast.',
      '2017–18': 'The 2017–18 season saw elevated activity in Queensland and NSW, with unplanned burns beginning to increase as drought conditions developed across eastern Australia.',
      '2018–19': 'Drought intensified across eastern Australia in 2018–19, with NSW recording its driest year on record. Unplanned burning increased sharply — a precursor to the Black Summer ahead.',
      '2019–20': 'The catastrophic Black Summer of 2019–20 stands out clearly: NSW, Victoria, and South Australia recorded near-100% unplanned burns, with unprecedented scale across the eastern seaboard.',
      '2020–21': 'Following the Black Summer, 2020–21 saw significantly reduced burning in the southeast. Queensland remained active, with a higher proportion of planned burns returning to normal seasonal patterns.'
    };

    if (target && bindings) {
      target.appendChild(bindings);
    }

    view.addSignalListener('selectedSeason', function(name, value) {
      const descEl = document.querySelector('#map-description');

      if (descEl && descriptions[value]) {
        descEl.classList.remove('fade-in-active');
        void descEl.offsetWidth;
        descEl.textContent = descriptions[value];
        descEl.classList.add('fade-in-active');
      }
    });
  })
  .catch(console.error);

// Embed the Fire Season Calendar (Section 2)
vegaEmbed('#vis-fire-calendar', fireSeasonCalendarSpec, { "actions": false })
  .then(function(result) {
    const view = result.view;
    const target = document.querySelector('#calendar-chart-control');
    const bindings = document.querySelector('#vis-fire-calendar .vega-bindings');
    if (target && bindings) {
      target.appendChild(bindings);
    }
  })
  .catch(console.error);

// Embed the fire risk trajectories chart (Section 2)
vegaEmbed('#vis-fire-risk-trajectories', fireRiskTrajectoriesSpec, { "actions": false })
  .then(function(result) {
    const view = result.view;
    const target = document.querySelector('#trajectories-scope-control');
    const bindings = document.querySelector('#vis-fire-risk-trajectories .vega-bindings');
    if (target && bindings) {
      target.appendChild(bindings);
    }

    const insights = {
      'Southeast focus': 'This view shows how fire profiles changed within each state. The bivariate map compares states in one selected season, while these small multiples show whether high unplanned burning was a one-off spike or part of a recurring pattern. In the southeast, 2019–20 stands out across several states, but the dot sizes show that share and scale are not the same thing.',
      'All states': 'This view shows that fire profiles vary sharply by region. Northern and inland states can record large burned-cell totals without following the same Black Summer pattern seen in the southeast. Dot size keeps scale visible, while the line position shows how much of each season’s burning was unplanned.'
    };

    view.addSignalListener('scopeSelection', function(name, value) {
      const insightEl = document.querySelector('.fire-risk-trajectories-insight p');
      if (insightEl && insights[value]) {
        insightEl.classList.remove('fade-in-active');
        void insightEl.offsetWidth; // Trigger reflow for smooth animation if desired
        insightEl.textContent = insights[value];
        insightEl.classList.add('fade-in-active');
      }
    });
  })
  .catch(console.error);

// Embed the major bushfire events timeline (Section 3)
vegaEmbed('#vis-bushfire-timeline', bushfireTimelineSpec, { "actions": false, "renderer": "svg" }).catch(console.error);

// Embed the Economic Shock Bubble Chart (Section 3)
vegaEmbed('#vis-economic-shock', economicShockSpec, { "actions": false }).then(function(result) {
    const view = result.view;
    
    // Custom HTML Legend interactive filter
    const legendItems = document.querySelectorAll('.custom-chart-legend .legend-group [data-severity]');
    let activeSeverity = 'All';
    
    legendItems.forEach(item => {
        item.addEventListener('click', function() {
            const severity = this.getAttribute('data-severity');
            
            if (activeSeverity === severity) {
                // Clicking the active one resets the filter to show All
                activeSeverity = 'All';
                legendItems.forEach(li => li.classList.remove('active-legend-filter'));
            } else {
                activeSeverity = severity;
                legendItems.forEach(li => li.classList.remove('active-legend-filter'));
                this.classList.add('active-legend-filter');
            }
            
            view.signal('select_severity', activeSeverity).runAsync().catch(console.error);
        });
    });
}).catch(console.error);

// Embed the domestic vs commercial claims diverging bar chart (Section 3)
vegaEmbed('#vis-domestic-commercial-claims', domesticCommercialClaimsSpec, { "actions": false }).catch(console.error);

// Embed the burned area vs economic loss scatter (Section 3, Fig 3D)
vegaEmbed('#vis-burned-area-loss', burnedAreaLossSpec, { "actions": false })
  .then(function(result) {
    const target = document.querySelector('#burned-area-loss-control');
    const bindings = document.querySelector('#vis-burned-area-loss .vega-bindings');
    if (target && bindings) {
      target.appendChild(bindings);
    }
  })
  .catch(console.error);

// Embed the threatened animal species chart (Section 4)
vegaEmbed('#vis-threatened-animals-by-class', threatenedAnimalsByClassSpec, { "actions": false }).catch(console.error);
