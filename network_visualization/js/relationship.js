// -----------------------------------------------------------------------------
// George Eliot relationship graph - fixed concentric radial layout
// Single data source:
//   ../Datasets/UpdatedGeorgeEliotGallery.csv
//
// This file drives people, biography, image, gender, relationship,
// closeness, and To / From / About letter links.
// -----------------------------------------------------------------------------

let svg = d3
  .select("#relationshipWeb")
  .append("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT)
  .attr("viewBox", "0 0 " + WIDTH + " " + HEIGHT)
  .attr("preserveAspectRatio", "xMidYMid meet");

let zoomLayer = svg.append("g").attr("class", "ZoomLayer");
let backgroundLayer = zoomLayer.append("g").attr("class", "NetworkBackgroundLayer");
let linkLayer = zoomLayer.append("g").attr("class", "LinkLayer");
let nodeLayer = zoomLayer.append("g").attr("class", "NodeLayer");
// Always rendered after nodes so hover labels can never be hidden by portraits.
let labelLayer = zoomLayer.append("g").attr("class", "HoverLabelLayer");

let CENTER_X = WIDTH / 2;
let CENTER_Y = HEIGHT / 2;

let nodes = [
  {
    Radius: 44,
    RawCloseness: 0,
    Closeness: 0,
    index: 0,
    nodeId: "node_0",
    ImagePath: "image_0",
    FullName: "George Eliot",
    Relationship: "friend",
    GenderNormalized: "female",
    HasImage: true,
    x: CENTER_X,
    y: CENTER_Y
  }
];

let links = [];
let people = [];
let images = svg.append("defs").attr("id", "images");

setImage("images/png/georgeeliot.png", 0);

let exactLettersByPerson = {};
let relationshipValues = [];
let enabledRelationships = new Set();

let genderValues = ["female", "male"];
let enabledGenders = new Set(genderValues);
let networkNodeSelection = null;
let networkLinkSelection = null;
let nodeGroupSelection = null;
let zoomBehavior = null;
let focusSelectedEnabled = false;

// -----------------------------------------------------------------------------
// Letter adapter
//
// Current data flow:
//
// selected graph person
//      ↓
// ../Datasets/UpdatedGeorgeEliotGallery.csv
//      ↓
// Dublin Core:Relation
//      ↓
// exact relationship category + archive URL + archive letter title
//
// The updated gallery already identifies the specific digital letter, so the
// visualization no longer has to infer a letter from a page reference.
// -----------------------------------------------------------------------------

let galleryLettersByPerson = {};
let letterDataReady = false;

function normalizeLookupName(name) {
  if (!name) return "";

  let value = String(name)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["“”][^"“”]+["“”]/g, " ")
    .replace(/\b(Mr|Mrs|Miss|Ms|Dr|Sir|Lady)\.?\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Convert "Last, First Middle" to "First Middle Last".
  if (value.includes(",")) {
    let commaIndex = value.indexOf(",");
    let last = value.slice(0, commaIndex).trim();
    let first = value.slice(commaIndex + 1).trim();
    value = first + " " + last;
  }

  return value
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractReferenceFromTitle(title) {
  if (!title) return "";

  let matches = String(title).match(/\((\d+\s*:\s*[^)]+)\)\s*$/);
  if (!matches) return "";

  return matches[1]
    .replace(/[–—]/g, "-")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

function extractItemIdFromUrl(url) {
  if (!url) return "";
  let match = String(url).match(/\/items\/show\/(\d+)/);
  return match ? match[1] : "";
}

function addDirectGalleryLetter(personName, letter) {
  let key = normalizeLookupName(personName);
  if (!key || !letter || !letter.url || !letter.title) return;

  if (!galleryLettersByPerson[key]) {
    galleryLettersByPerson[key] = [];
  }

  let duplicate = galleryLettersByPerson[key].some(function(existing) {
    return existing.url === letter.url &&
      existing.relationType === letter.relationType;
  });

  if (!duplicate) {
    galleryLettersByPerson[key].push(letter);
  }
}

function parseUpdatedRelation(personName, relationHtml) {
  if (!relationHtml) return;

  let container = document.createElement("div");
  container.innerHTML = relationHtml;

  let relationType = "";

  Array.from(container.children).forEach(function(element) {
    let tag = element.tagName ? element.tagName.toLowerCase() : "";

    if (tag === "strong") {
      let heading = element.textContent.trim().replace(/:$/, "");
      if (heading === "To" || heading === "From" || heading === "About") {
        relationType = heading;
      }
      return;
    }

    if (tag !== "a" || !relationType) return;

    let url = element.getAttribute("href") || "";
    let title = element.textContent.trim();
    let displayTitle = title
      .replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "")
      .trim();

    addDirectGalleryLetter(personName, {
      relationType: relationType,
      title: title,
      displayTitle: displayTitle,
      url: url,
      itemId: extractItemIdFromUrl(url),
      identifier: extractReferenceFromTitle(title)
    });
  });
}

function personLookupCandidates(data) {
  return [
    data["FullName"],
    [data["First Name"], data["Second Names"], data["Last Name"]]
      .filter(Boolean)
      .join(" "),
    [data["First Name"], data["Last Name"]]
      .filter(Boolean)
      .join(" ")
  ]
    .map(normalizeLookupName)
    .filter(Boolean);
}

function getLettersForNode(data) {
  let results = [];
  let seen = {};

  personLookupCandidates(data).forEach(function(name) {
    (galleryLettersByPerson[name] || []).forEach(function(letter) {
      let key = [letter.relationType, letter.url].join("|");
      if (seen[key]) return;

      seen[key] = true;
      results.push(letter);
    });
  });

  return results;
}

// Kept for compatibility with the existing details renderer.
function getExactLettersForNode(data) {
  return getLettersForNode(data);
}

d3.csv("../Datasets/UpdatedGeorgeEliotGallery.csv")
  .then(function(galleryRows) {
    galleryRows.forEach(function(row) {
      parseUpdatedRelation(
        row["Dublin Core:Title"],
        row["Dublin Core:Relation"]
      );
    });

    letterDataReady = true;

    let totalLetters = Object.keys(galleryLettersByPerson).reduce(
      function(total, personKey) {
        return total + galleryLettersByPerson[personKey].length;
      },
      0
    );

    console.log(
      "Loaded updated gallery relations:",
      Object.keys(galleryLettersByPerson).length,
      "people with direct letter relations;",
      totalLetters,
      "direct letter links."
    );

    applyFilters();
  })
  .catch(function(error) {
    console.error(
      "Could not load ../Datasets/UpdatedGeorgeEliotGallery.csv:",
      error
    );
  });


function normalizeRelationship(value) {
  return String(value || "").trim().toLowerCase() === "family"
    ? "family"
    : "friend";
}

function normalizeGender(node) {
  let raw =
    node["Gender"] ||
    node["gender"] ||
    node["Sex"] ||
    node["sex"] ||
    node["Gender Identity"] ||
    "";

  let value = String(raw).trim().toLowerCase();

  if (
    value === "f" ||
    value === "female" ||
    value === "woman" ||
    value === "women"
  ) {
    return "female";
  }

  if (
    value === "m" ||
    value === "male" ||
    value === "man" ||
    value === "men"
  ) {
    return "male";
  }

  return "unknown";
}

function genderColor(value) {
  let gender = String(value || "").toLowerCase();
  if (gender === "female") return "#c46f95";
  if (gender === "male") return "#5f87b8";
  return "#8c8378";
}


// Closeness is still used internally to place people on the three rings.
// The user-facing closeness FILTER was removed; this function is only layout logic.
function closenessBucket(node) {
  let value = Number(node.RawCloseness);

  if (!Number.isFinite(value)) {
    return "distant";
  }

  if (value <= 5) {
    return "close";
  }

  if (value <= 10) {
    return "medium";
  }

  return "distant";
}


function galleryDisplayName(title) {
  let value = String(title || "")
    .replace(/\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (value.includes(",")) {
    let commaIndex = value.indexOf(",");
    let last = value.slice(0, commaIndex).trim();
    let first = value.slice(commaIndex + 1).trim();
    value = first + " " + last;
  }

  return value.replace(/\s+/g, " ").trim();
}

function galleryBirthDeath(title) {
  let value = String(title || "");
  let match = value.match(/\((\d{4})\s*[-–—]\s*(\d{4})\)\s*$/);

  if (!match) {
    return { birth: "", death: "" };
  }

  return {
    birth: match[1],
    death: match[2]
  };
}

function firstGalleryImage(value) {
  if (!value) return "";

  return String(value)
    .split(",")
    .map(function(item) { return item.trim(); })
    .filter(Boolean)[0] || "";
}

// -----------------------------------------------------------------------------
// People data
// -----------------------------------------------------------------------------

let parseData = d3.csv("../Datasets/UpdatedGeorgeEliotGallery.csv", function(row) {
  if (!row) return;

  let node = Object.assign({}, row);

  node = setIndex(node);
  node["nodeId"] = "node_" + node["index"];
  node["FullName"] = galleryDisplayName(row["Dublin Core:Title"]);

  let dates = galleryBirthDeath(row["Dublin Core:Title"]);
  node["Birth"] = dates.birth;
  node["Death"] = dates.death;

  node["Biography"] = row["Dublin Core:Description"] || "";
  node["Image"] = firstGalleryImage(row["file"]);

  let closeness = parseInt(row["Closeness"], 10);
  if (!Number.isFinite(closeness) || closeness < 0) closeness = 15;

  node.RawCloseness = closeness;
  node.Closeness = closeness;
  node.Radius = Math.max(13, Math.min(19, 20 - closeness * 0.30));

  node.Relationship = normalizeRelationship(row["Relationship"]);

  // Use only gender explicitly stored in Dublin Core:Type.
  node.GenderNormalized = normalizeGender({
    Gender: row["Dublin Core:Type"]
  });

  let person = {
    name: node["FullName"],
    id: node["nodeId"],
    data: node
  };
  people.push(person);

  node.mainColor = genderColor(node.GenderNormalized);
  node.secondaryColor = "#f3ece3";

  node.HasImage = Boolean(node.Image);
  if (node.HasImage) {
    setImage(node.Image, node.index);
    node.ImagePath = "image_" + node.index;
  } else {
    node.ImagePath = null;
  }

  nodes.push(node);
  links.push({ source: 0, target: node.index });
});

parseData.then(function() {
  people.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  populateSearchList();
  buildRelationshipFilters();
  buildGenderFilters();
  drawNetwork();
  bindControls();

  document.getElementById("NetworkStatus").textContent =
    (nodes.length - 1) + " people loaded";
});

// -----------------------------------------------------------------------------
// Network background
// -----------------------------------------------------------------------------

function drawZoomBackground() {
  backgroundLayer.selectAll("*").remove();

  let dots = [];
  for (let i = 0; i < 42; i++) {
    let angle = i * 2.399963229728653;
    let radius = 95 + ((i * 73) % 430);
    dots.push({
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius,
      r: 0.9 + (i % 3) * 0.25
    });
  }

  backgroundLayer
    .selectAll("circle.BackgroundDot")
    .data(dots)
    .enter()
    .append("circle")
    .attr("class", "BackgroundDot")
    .attr("cx", function(d) { return d.x; })
    .attr("cy", function(d) { return d.y; })
    .attr("r", function(d) { return d.r; });

  let rings = [
    { radius: 145, label: "Closer circle" },
    { radius: 295, label: "Middle circle" },
    { radius: 415, label: "Distant circle" }
  ];

  let ringGroups = backgroundLayer
    .selectAll("g.DistanceRing")
    .data(rings)
    .enter()
    .append("g")
    .attr("class", "DistanceRing");

  ringGroups
    .append("circle")
    .attr("class", "DistanceRingOuter")
    .attr("cx", CENTER_X)
    .attr("cy", CENTER_Y)
    .attr("r", function(d) { return d.radius; });

  ringGroups
    .append("circle")
    .attr("class", "DistanceRingInner")
    .attr("cx", CENTER_X)
    .attr("cy", CENTER_Y)
    .attr("r", function(d) { return d.radius - 4; });

  let labelGroup = ringGroups
    .append("g")
    .attr("class", "RingLabelPlaque")
    .attr("transform", function(d) {
      return "translate(" + CENTER_X + "," + (CENTER_Y - d.radius) + ")";
    });

  labelGroup
    .append("rect")
    .attr("x", -58)
    .attr("y", -10)
    .attr("width", 116)
    .attr("height", 20)
    .attr("rx", 1)
    .attr("ry", 1);

  labelGroup
    .append("text")
    .attr("x", 0)
    .attr("y", 4)
    .attr("text-anchor", "middle")
    .text(function(d) { return d.label; });

  backgroundLayer
    .append("circle")
    .attr("class", "CenterHalo")
    .attr("cx", CENTER_X)
    .attr("cy", CENTER_Y)
    .attr("r", 82);

  backgroundLayer
    .append("text")
    .attr("class", "CenterLabel")
    .attr("x", CENTER_X)
    .attr("y", CENTER_Y + 94)
    .attr("text-anchor", "middle")
    .text("George Eliot");
}

// -----------------------------------------------------------------------------
// Radial layout (fixed, non-force)
// -----------------------------------------------------------------------------

function layoutNodes() {
  let bands = {
    close: [],
    medium: [],
    distant: []
  };

  nodes.slice(1).forEach(function(node) {
    bands[closenessBucket(node)].push(node);
  });

  Object.keys(bands).forEach(function(key) {
    bands[key].sort(function(a, b) {
      if (a.RawCloseness !== b.RawCloseness) {
        return a.RawCloseness - b.RawCloseness;
      }
      return a.FullName.localeCompare(b.FullName);
    });
  });

  let bandConfig = {
    close:   { startRadius: 145, laneGap: 58, maxRadius: 245, phase: -Math.PI / 2, titleGap: 0.66 },
    medium:  { startRadius: 295, laneGap: 58, maxRadius: 365, phase: -Math.PI / 2, titleGap: 0.42 },
    distant: { startRadius: 415, laneGap: 58, maxRadius: 485, phase: -Math.PI / 2, titleGap: 0.42 }
  };

  function placeBand(list, config) {
    if (!list.length) return;

    let cursor = 0;
    let lane = 0;

    while (cursor < list.length) {
      let radius = Math.min(
        config.startRadius + lane * config.laneGap,
        config.maxRadius
      );

      let minArcSpacing = 46;
      let capacity = Math.max(
        1,
        Math.floor((2 * Math.PI * radius) / minArcSpacing)
      );

      let remaining = list.length - cursor;
      let count = Math.min(capacity, remaining);

      if (radius === config.maxRadius) {
        count = remaining;
      }

      // Reserve a clean title gap centered at 12 o'clock.
      // The closer ring needs a wider gap because the same plaque occupies
      // more angular space at a smaller radius.
      let titleGap = config.titleGap || 0.42;
      let startAngle = -Math.PI / 2 + titleGap / 2;
      let usableArc = Math.PI * 2 - titleGap;

      // Alternate the visual start slightly between lanes.
      let laneShift = lane % 2 === 0 ? 0 : (usableArc / Math.max(count, 2)) / 2;

      for (let i = 0; i < count; i++) {
        let node = list[cursor + i];
        let angle =
          startAngle +
          laneShift +
          usableArc * ((i + 0.5) / count);

        node.x = CENTER_X + Math.cos(angle) * radius;
        node.y = CENTER_Y + Math.sin(angle) * radius;
      }

      cursor += count;
      lane += 1;

      if (
        cursor < list.length &&
        config.startRadius + lane * config.laneGap > config.maxRadius
      ) {
        config.maxRadius += config.laneGap;
      }
    }
  }

  placeBand(bands.close, Object.assign({}, bandConfig.close));
  placeBand(bands.medium, Object.assign({}, bandConfig.medium));
  placeBand(bands.distant, Object.assign({}, bandConfig.distant));

  nodes[0].x = CENTER_X;
  nodes[0].y = CENTER_Y;
}

function updateNetworkGeometry() {
  if (!networkLinkSelection || !nodeGroupSelection) return;

  networkLinkSelection
    .attr("x1", CENTER_X)
    .attr("y1", CENTER_Y)
    .attr("x2", function(d) {
      let targetIndex = d.target.index !== undefined ? d.target.index : d.target;
      return nodes[targetIndex].x;
    })
    .attr("y2", function(d) {
      let targetIndex = d.target.index !== undefined ? d.target.index : d.target;
      return nodes[targetIndex].y;
    });

  nodeGroupSelection.attr("transform", function(d) {
    return "translate(" + d.x + "," + d.y + ")";
  });

  networkNodeSelection.attr("cx", 0).attr("cy", 0);
}

function initialViewTransform() {
  // Network is now centered in the SVG coordinate system. A very small
  // initial scale gives the outer ring breathing room inside the frame.
  let scale = 1.50;
  return d3.zoomIdentity
    .translate(WIDTH / 2, HEIGHT / 2)
    .scale(scale)
    .translate(-CENTER_X, -CENTER_Y);
}

function applyInitialView(duration) {
  if (!zoomBehavior) return;

  let selection = duration
    ? svg.transition().duration(duration)
    : svg;

  selection.call(zoomBehavior.transform, initialViewTransform());
}

// -----------------------------------------------------------------------------
// Network drawing
// -----------------------------------------------------------------------------

function drawNetwork() {
  drawZoomBackground();
  layoutNodes();

  networkLinkSelection = linkLayer
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "RelationshipLine");

  nodeGroupSelection = nodeLayer
    .selectAll("g.PersonNode")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", function(d) {
      return d.index === 0 ? "PersonNode GeorgeEliotNode" : "PersonNode";
    })
    .attr("id", function(d) {
      return d["nodeId"];
    });
networkNodeSelection = nodeGroupSelection
    .append("circle")
    .attr("class", function(d) {
      let genderClass =
        d.GenderNormalized === "female"
          ? " GenderFemale"
          : d.GenderNormalized === "male"
            ? " GenderMale"
            : " GenderUnknown";
      return "RelationshipNode" + genderClass;
    })
    .attr("r", function(d) { return d.Radius; })
    .attr("fill", function(d) {
      if (d.index === 0 || d.HasImage) return "url(#" + d.ImagePath + ")";
      return "#f7f1e7";
    })
    .attr("stroke", function(d) {
      return d.index === 0
        ? genderColor("female")
        : genderColor(d.GenderNormalized);
    })
    .attr("stroke-width", function(d) {
      return d.index === 0 ? 4 : 3.5;
    });

  nodeGroupSelection
    .filter(function(d) { return d.index !== 0 && !d.HasImage; })
    .append("text")
    .attr("class", "NodeInitials")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text(function(d) {
      let parts = String(d["FullName"] || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (!parts.length) return "?";

      let first = parts[0];
      let last = parts.length > 1 ? parts[parts.length - 1] : "";

      return (
        (first.charAt(0) || "") +
        (last.charAt(0) || "")
      ).toUpperCase();
    });

  nodeGroupSelection
    .append("circle")
    .attr("class", "NodeHitArea")
    .attr("r", function(d) { return d.Radius + 7; })
    .attr("fill", "transparent")
    .attr("stroke", "none")
    .style("pointer-events", "all")
    .style("cursor", function(d) {
      return d.index === 0 ? "default" : "pointer";
    })
    .on("mouseenter", function(d) {
      if (!d || d.index === 0) return;
      selectNode(d3.select(this.parentNode).select(".RelationshipNode"), d);
    })
    .on("mouseleave", function(d) {
      if (!d || d.index === 0) return;
      deselectNode(d3.select(this.parentNode).select(".RelationshipNode"), d);
    })
    .on("mousedown", function() {
      if (d3.event) d3.event.stopPropagation();
    })
    .on("click", function(d) {
      if (d3.event) {
        d3.event.preventDefault();
        d3.event.stopPropagation();
      }

      if (!d) return;

      if (d.index === 0) {
        returnToNetworkView();
        return;
      }

      selectPerson(d, true);
    });

  updateNetworkGeometry();

  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.6, 2.6])
    .on("zoom", function() {
      zoomLayer.attr("transform", d3.event.transform);
    });

  svg.call(zoomBehavior).on("dblclick.zoom", null);
  applyInitialView(0);

  svg.on("click.background", function() {
    if (d3.event.target === svg.node()) {
      clearDisplay(true);
      applyFocusSelectedState();
      showExploreSidebar();
      applyInitialView(350);
    }
  });

  applyFilters();
}


function showExploreSidebar() {
  let explore = document.getElementById("ExplorePanel");
  let person = document.getElementById("PersonPanel");
  let sidebar = document.querySelector(".SidebarColumn");

  if (explore) explore.hidden = false;
  if (person) person.hidden = true;
  if (sidebar) sidebar.scrollTop = 0;
}

function showPersonSidebar() {
  let explore = document.getElementById("ExplorePanel");
  let person = document.getElementById("PersonPanel");
  let sidebar = document.querySelector(".SidebarColumn");

  if (explore) explore.hidden = true;
  if (person) person.hidden = false;
  if (sidebar) sidebar.scrollTop = 0;
}

function returnToNetworkView() {
  resetNetworkSelection();
  showExploreSidebar();
}

// -----------------------------------------------------------------------------
// Detail panel
// -----------------------------------------------------------------------------

function showSummaryForData(data) {
  if (!data || data.index === 0) return;

  let biography = document.getElementById("Biography");
  biography.style.display = "block";
  biography.style.borderTopColor = genderColor(data.GenderNormalized);

  document.getElementById("CloseButton").style.display = "block";
  document.getElementById("BiographyName").textContent = data["FullName"] || "";

  document.getElementById("BirthAndDeath").textContent =
    getBirthDeathDates(data["Birth"], data["Death"]);

  let relationship = document.getElementById("BiographyRelationship");
  relationship.textContent = capitalizeWords(data.Relationship || "friend");
  relationship.style.borderColor = genderColor(data.GenderNormalized);

  let summary = document.getElementById("BiographySummary");
  summary.innerHTML = handleBiographyText(data["Biography"]);

  let photo = document.getElementById("BiographyPhoto");
  if (data.Image) {
    photo.src = data.Image;
    photo.style.display = "block";
  } else {
    photo.src = "";
    photo.style.display = "none";
  }

  renderRelatedLetterBrowser(data);
}

function selectPerson(data, shouldFocus) {
  if (!data || data.index === 0) return;

  showPersonSidebar();
  window.selectedPersonIndex = data.index;
  setSelectedPerson(data);
  showSummaryForData(data);
  applyFocusSelectedState();

  let biography = document.getElementById("Biography");
  if (biography) {
    biography.classList.add("BiographyActive");
  }

  if (shouldFocus) {
    window.setTimeout(function() {
      focusOnPerson(data);
    }, 40);
  }

  document.getElementById("NetworkStatus").textContent =
    "Selected " + data.FullName;
}

function applyFocusSelectedState() {
  let selectedIndex = window.selectedPersonIndex;

  d3.selectAll(".PersonNode")
    .classed("FocusDimmed", function(d) {
      return (
        focusSelectedEnabled &&
        selectedIndex &&
        d.index !== 0 &&
        d.index !== selectedIndex
      );
    });

  d3.selectAll(".RelationshipLine")
    .classed("FocusDimmedLine", function(d) {
      let targetIndex = d.target.index !== undefined ? d.target.index : d.target;
      return (
        focusSelectedEnabled &&
        selectedIndex &&
        targetIndex !== selectedIndex
      );
    });
}

// -----------------------------------------------------------------------------
// Search
// -----------------------------------------------------------------------------

function populateSearchList() {
  // Search uses live results now.
}

function renderPeopleSearch() {
  let input = document.getElementById("searchBar");
  let results = document.getElementById("searchResults");
  if (!input || !results) return;

  let term = input.value.trim().toLowerCase();

  if (!term) {
    results.hidden = true;
    results.innerHTML = "";
    return;
  }

  let matches = people
    .filter(function(person) {
      return person.name.toLowerCase().includes(term);
    })
    .slice(0, 8);

  results.innerHTML = "";

  if (!matches.length) {
    let empty = document.createElement("div");
    empty.className = "SearchEmpty";
    empty.textContent = "No matching people";
    results.appendChild(empty);
    results.hidden = false;
    return;
  }

  matches.forEach(function(person) {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "SearchResult";

    let name = document.createElement("span");
    name.className = "SearchResultName";
    name.textContent = person.name;

    let relationship = document.createElement("span");
    relationship.className = "SearchResultType";
    relationship.textContent = person.data.Relationship
      ? capitalizeWords(person.data.Relationship)
      : "Other";

    button.appendChild(name);
    button.appendChild(relationship);

    button.addEventListener("click", function() {
      input.value = person.name;
      results.hidden = true;
      selectPerson(person.data, true);
    });

    results.appendChild(button);
  });

  results.hidden = false;
}

function findPerson() {
  let searchTerm = document
    .getElementById("searchBar")
    .value
    .trim()
    .toLowerCase();

  if (!searchTerm) return;

  let exact = people.find(function(person) {
    return person.name.toLowerCase() === searchTerm;
  });

  let partial = people.find(function(person) {
    return person.name.toLowerCase().includes(searchTerm);
  });

  let match = exact || partial;

  if (!match) {
    document.getElementById("NetworkStatus").textContent =
      "No matching person found";
    return;
  }

  selectPerson(match.data, true);
}

function focusOnPerson(data) {
  if (!zoomBehavior || !data) return;

  // Use the SVG's own centered coordinate system so selection lands in the
  // true middle of the visible graph, regardless of sidebar widths.
  let scale = 1.55;
  let transform = d3.zoomIdentity
    .translate(WIDTH / 2, HEIGHT / 2)
    .scale(scale)
    .translate(-data.x, -data.y);

  svg
    .transition()
    .duration(500)
    .ease(d3.easeCubicOut)
    .call(zoomBehavior.transform, transform);
}

function resetNetworkSelection() {
  document.getElementById("searchBar").value = "";
  clearDisplay(true);

  d3.selectAll(".PersonNode").classed("FocusDimmed", false);
  d3.selectAll(".RelationshipLine").classed("FocusDimmedLine", false);

  if (zoomBehavior) {
    svg
      .transition()
      .duration(450)
      .call(zoomBehavior.transform, initialViewTransform());
  }

  document.getElementById("NetworkStatus").textContent =
    (nodes.length - 1) + " people loaded";
}

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------

function uniqueRelationships() {
  let values = {};

  nodes.slice(1).forEach(function(node) {
    let key = String(node.Relationship || "other").trim().toLowerCase();
    values[key] = true;
  });

  return Object.keys(values).sort();
}

function buildRelationshipFilters() {
  relationshipValues = ["family", "friend"];
  enabledRelationships = new Set(relationshipValues);

  let container = document.getElementById("relationshipFilters");
  let legend = document.getElementById("legendItems");

  container.innerHTML = "";
  if (legend) legend.innerHTML = "";

  relationshipValues.forEach(function(value) {
    let label = document.createElement("label");
    label.className = "RelationshipPill";

    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = true;

    let text = document.createElement("span");
    text.textContent = capitalizeWords(value);

    checkbox.addEventListener("change", function() {
      if (checkbox.checked) {
        enabledRelationships.add(value);
      } else {
        enabledRelationships.delete(value);
      }
      applyFilters();
    });

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });

  if (legend) {
    [
      { label: "Female", color: genderColor("female") },
      { label: "Male", color: genderColor("male") }
    ].forEach(function(entry) {
      let item = document.createElement("span");
      item.className = "LegendItem";

      let dot = document.createElement("span");
      dot.className = "LegendDot GenderLegendDot";
      dot.style.backgroundColor = "transparent";
      dot.style.borderColor = entry.color;

      let legendText = document.createElement("span");
      legendText.textContent = entry.label;

      item.appendChild(dot);
      item.appendChild(legendText);
      legend.appendChild(item);
    });
  }
}



function buildGenderFilters() {
  enabledGenders = new Set(genderValues);

  let container = document.getElementById("genderFilters");
  if (!container) return;

  container.innerHTML = "";

  genderValues.forEach(function(value) {
    let label = document.createElement("label");
    label.className = "RelationshipPill GenderPill";

    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = true;

    let text = document.createElement("span");
    text.textContent = capitalizeWords(value);

    checkbox.addEventListener("change", function() {
      if (checkbox.checked) {
        enabledGenders.add(value);
      } else {
        enabledGenders.delete(value);
      }

      applyFilters();
    });

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}


function nodePassesFilters(node) {
  if (node.index === 0) return true;

  let relationship = normalizeRelationship(node.Relationship);
  if (!enabledRelationships.has(relationship)) return false;

  if (!enabledGenders.has(node.GenderNormalized)) return false;

  return true;
}

function applyFilters() {
  if (!networkNodeSelection || !networkLinkSelection) return;

  d3.selectAll(".PersonNode").classed("FilteredOut", function(d) {
    return !nodePassesFilters(d);
  });

  networkLinkSelection.classed("FilteredLine", function(d) {
    let target = d.target.index !== undefined ? d.target : nodes[d.target];
    return target ? !nodePassesFilters(target) : false;
  });

  let visible = nodes.slice(1).filter(nodePassesFilters).length;
  document.getElementById("NetworkStatus").textContent =
    visible + " of " + (nodes.length - 1) + " people visible";

  applyFocusSelectedState();
}


// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

function bindControls() {
  let searchBar = document.getElementById("searchBar");
  let searchResults = document.getElementById("searchResults");

  searchBar.addEventListener("input", renderPeopleSearch);

  searchBar.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      findPerson();
      searchResults.hidden = true;
    }

    if (event.key === "Escape") {
      searchResults.hidden = true;
    }
  });

  document.getElementById("clearButton").addEventListener("click", function() {
    searchBar.value = "";
    searchResults.hidden = true;
    resetAll();
    searchBar.focus();
  });

  document.getElementById("CloseButton").addEventListener("click", function() {
    returnToNetworkView();
  });

  document.getElementById("BackToNetworkButton").addEventListener("click", function() {
    returnToNetworkView();
  });


  document.getElementById("selectAllRelationships").addEventListener("click", function() {
    enabledRelationships = new Set(relationshipValues);

    document
      .querySelectorAll("#relationshipFilters input[type='checkbox']")
      .forEach(function(input) {
        input.checked = true;
      });

    applyFilters();
  });

  document.getElementById("focusSelectedToggle").addEventListener("change", function(event) {
    focusSelectedEnabled = event.target.checked;
    applyFocusSelectedState();
  });

  document.getElementById("zoomInButton").addEventListener("click", function() {
    svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.25);
  });

  document.getElementById("zoomOutButton").addEventListener("click", function() {
    svg.transition().duration(250).call(zoomBehavior.scaleBy, 0.8);
  });

  document.getElementById("resetViewButton").addEventListener("click", function() {
    svg
      .transition()
      .duration(450)
      .call(zoomBehavior.transform, initialViewTransform());
  });


  document.addEventListener("click", function(event) {
    if (
      !event.target.closest(".SearchWrap") &&
      !event.target.closest(".SearchResults")
    ) {
      searchResults.hidden = true;
    }
  });
}

function resetAll() {
  enabledGenders = new Set(genderValues);
  document
    .querySelectorAll("#genderFilters input")
    .forEach(function(checkbox) {
      checkbox.checked = true;
    });
  showExploreSidebar();
  document.getElementById("searchBar").value = "";

  focusSelectedEnabled = false;
  let focusToggle = document.getElementById("focusSelectedToggle");
  if (focusToggle) focusToggle.checked = false;

  enabledRelationships = new Set(relationshipValues);

  document
    .querySelectorAll("#relationshipFilters input[type='checkbox']")
    .forEach(function(input) {
      input.checked = true;
    });

  clearDisplay(true);
  d3.selectAll(".PersonNode").classed("FocusDimmed", false);
  d3.selectAll(".RelationshipLine").classed("FocusDimmedLine", false);
  applyFilters();

  svg
    .transition()
    .duration(450)
    .call(zoomBehavior.transform, initialViewTransform());
}
