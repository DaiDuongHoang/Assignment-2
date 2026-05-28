const wildlifeGroups = [
  {
    key: "reptiles",
    name: "Reptiles",
    count: 2492000000,
    countLabel: "2.49 Billion",
    share: 87,
    color: "#b71c1c",
    icon: "Images/Icons/reptile.svg",
    label: "Skinks, dragons, geckos"
  },
  {
    key: "birds",
    name: "Birds",
    count: 180000000,
    countLabel: "180 Million",
    share: 6,
    color: "#f57c00",
    icon: "Images/Icons/bird.svg",
    label: "Honeyeaters, parrots, lyrebirds"
  },
  {
    key: "mammals",
    name: "Mammals",
    count: 143000000,
    countLabel: "143 Million",
    share: 5,
    color: "#8b5e3c",
    icon: "Images/Icons/mammals.svg",
    label: "Koalas, gliders, wallabies"
  },
  {
    key: "frogs",
    name: "Frogs",
    count: 51000000,
    countLabel: "51 Million",
    share: 2,
    color: "#0284c7",
    icon: "Images/Icons/frog.svg",
    label: "Alpine and stream frogs"
  }
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-AU").format(value);
}

function buildWildlifeWaffle() {
  const waffle = document.querySelector("#wildlife-waffle");
  const legend = document.querySelector("#wildlife-waffle-legend");
  const summary = document.querySelector("#wildlife-summary");

  if (!waffle || !legend || !summary) return;

  const tooltip = document.createElement("div");
  tooltip.className = "wildlife-tooltip";
  document.body.appendChild(tooltip);

  const totalCount = wildlifeGroups.reduce(
    (sum, group) => sum + group.count,
    0
  );
  const dotData = wildlifeGroups.flatMap((group) =>
    Array.from({ length: group.share }, (_, index) => ({ ...group, index }))
  );

  function setHighlight(groupKey) {
    waffle.classList.toggle("has-highlight", Boolean(groupKey));
    summary.classList.toggle("has-highlight", Boolean(groupKey));

    document.querySelectorAll("[data-wildlife-group]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.wildlifeGroup === groupKey);
    });
  }

  function clearHighlight() {
    setHighlight(null);
    tooltip.classList.remove("is-visible");
  }

  function showTooltip(event, group) {
    const preciseShare = ((group.count / totalCount) * 100).toFixed(1);
    tooltip.innerHTML = `
      <strong>${group.name}</strong>
      ${group.countLabel} affected<br>
      ${preciseShare}% of the estimated total
    `;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.classList.add("is-visible");
  }

  dotData.forEach((group) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "wildlife-dot";
    dot.dataset.wildlifeGroup = group.key;
    dot.style.setProperty("--dot-color", group.color);
    dot.setAttribute(
      "aria-label",
      `${group.name}: ${group.countLabel}, ${group.share}% of waffle marks`
    );

    dot.addEventListener("mouseenter", (event) => {
      setHighlight(group.key);
      showTooltip(event, group);
    });
    dot.addEventListener("mousemove", (event) => showTooltip(event, group));
    dot.addEventListener("mouseleave", clearHighlight);
    dot.addEventListener("focus", (event) => {
      setHighlight(group.key);
      showTooltip(event, group);
    });
    dot.addEventListener("blur", clearHighlight);

    waffle.appendChild(dot);
  });

  wildlifeGroups.forEach((group) => {
    const legendItem = document.createElement("button");
    legendItem.type = "button";
    legendItem.className = "wildlife-legend-item";
    legendItem.dataset.wildlifeGroup = group.key;
    legendItem.style.setProperty("--group-color", group.color);
    legendItem.innerHTML = `
      <span class="wildlife-legend-dot" aria-hidden="true"></span>
      <span class="wildlife-legend-name">${group.name}</span>
      <span class="wildlife-legend-share">${group.share}%</span>
    `;
    legendItem.addEventListener("mouseenter", () => setHighlight(group.key));
    legendItem.addEventListener("mouseleave", clearHighlight);
    legendItem.addEventListener("focus", () => setHighlight(group.key));
    legendItem.addEventListener("blur", clearHighlight);
    legend.appendChild(legendItem);

    const card = document.createElement("article");
    card.className = "wildlife-summary-card";
    card.dataset.wildlifeGroup = group.key;
    card.style.setProperty("--group-color", group.color);
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="wildlife-summary-icon">
        <img src="${group.icon}" alt="" aria-hidden="true">
      </div>
      <div>
        <div class="wildlife-summary-name">${group.name}</div>
        <div class="wildlife-summary-count">${group.countLabel}</div>
        <div class="wildlife-summary-status">estimated affected</div>
        <div class="wildlife-summary-label">${group.label}</div>
      </div>
    `;
    card.addEventListener("mouseenter", () => setHighlight(group.key));
    card.addEventListener("mouseleave", clearHighlight);
    card.addEventListener("focus", () => setHighlight(group.key));
    card.addEventListener("blur", clearHighlight);
    summary.appendChild(card);
  });
}

buildWildlifeWaffle();
