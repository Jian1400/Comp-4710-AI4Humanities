// -----------------------------------------------------------------------------
// George Eliot correspondence timeline - dynamic annual force layout
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
let countLabelLayer = zoomLayer.append("g").attr("class", "CorrespondenceCountLayer");
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
let networkCountLabelSelection = null;
let nodeGroupSelection = null;
let zoomBehavior = null;
let focusSelectedEnabled = false;

let timelineSimulation = null;
let timelineMinYear = null;
let timelineMaxYear = null;
let globalMaxAnnualLetterCount = 1;
let currentTimelineYear = null;
window.currentTimelineYear = null;

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


function extractLetterYearFromTitle(title) {
  if (!title) return null;

  let clean = String(title)
    .replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "")
    .trim();

  // Normalize uncertain/bracketed digits before extracting the year.
  // Examples:
  //   187[4]        -> 1874
  //   187[4?]       -> 1874
  //   [1864]        -> 1864
  //   October1864   -> October1864
  clean = clean.replace(
    /\[\s*(\d{1,4})\s*\??\s*\]/g,
    "$1"
  );

  // Accept years even when attached to text or punctuation.
  // A year cannot be directly preceded/followed by another digit, preventing
  // accidental extraction from a longer numeric identifier.
  let regex = /(?:^|[^\d])((?:17|18|19)\d{2})(?!\d)/g;
  let matches = [];
  let match;

  while ((match = regex.exec(clean)) !== null) {
    matches.push(Number(match[1]));
  }

  if (!matches.length) return null;

  return matches[matches.length - 1];
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
      identifier: extractReferenceFromTitle(title),
      year: extractLetterYearFromTitle(title)
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

let letterDataPromise = d3.csv("../Datasets/UpdatedGeorgeEliotGallery.csv")
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

    return galleryRows;
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

  // This visualization intentionally ignores the manually assigned closeness
  // for positioning. Every person bubble is the same size; annual To/From
  // letter count controls only distance from George Eliot.
  node.RawCloseness = 0;
  node.Closeness = 0;
  node.Radius = 18;
  node.YearCounts = {};
  node.AnnualLetterCount = 0;

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

Promise.all([parseData, letterDataPromise]).then(function() {
  people.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  initializeCorrespondenceTimeline();

  populateSearchList();
  buildRelationshipFilters();
  buildGenderFilters();
  drawNetwork();
  bindControls();
  bindTimelineControls();

  updateTimelineYear(currentTimelineYear, false);
});

// -----------------------------------------------------------------------------
// Network background
// -----------------------------------------------------------------------------

function drawZoomBackground() {
  backgroundLayer.selectAll("*").remove();

  let dots = [];
  for (let i = 0; i < 52; i++) {
    let angle = i * 2.399963229728653;
    let radius = 90 + ((i * 67) % 420);
    dots.push({
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius,
      r: 0.8 + (i % 3) * 0.22
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

  backgroundLayer
    .append("circle")
    .attr("class", "CenterHalo TimelineCenterHalo")
    .attr("cx", CENTER_X)
    .attr("cy", CENTER_Y)
    .attr("r", 76);

  backgroundLayer
    .append("circle")
    .attr("class", "ZeroLetterBoundary")
    .attr("cx", CENTER_X)
    .attr("cy", CENTER_Y)
    .attr("r", 405);

  backgroundLayer
    .append("text")
    .attr("class", "ZeroLetterBoundaryLabel")
    .attr("x", CENTER_X)
    .attr("y", CENTER_Y - 414)
    .attr("text-anchor", "middle")
    .text("0 letters outside");

  backgroundLayer
    .append("text")
    .attr("class", "CenterLabel")
    .attr("x", CENTER_X)
    .attr("y", CENTER_Y + 92)
    .attr("text-anchor", "middle")
    .text("George Eliot");
}

// -----------------------------------------------------------------------------
// Annual correspondence layout
// -----------------------------------------------------------------------------

function initializeCorrespondenceTimeline() {
  let validYears = [];
  globalMaxAnnualLetterCount = 1;

  nodes.slice(1).forEach(function(node) {
    node.YearCounts = {};

    getLettersForNode(node).forEach(function(letter) {
      if (letter.relationType !== "To" && letter.relationType !== "From") {
        return;
      }

      if (
        letter.year === null ||
        letter.year === undefined ||
        letter.year === ""
      ) {
        return;
      }

      let year = Number(letter.year);
      if (!Number.isFinite(year) || year < 1700) return;

      node.YearCounts[year] = (node.YearCounts[year] || 0) + 1;
      validYears.push(year);
    });

    Object.keys(node.YearCounts).forEach(function(year) {
      globalMaxAnnualLetterCount = Math.max(
        globalMaxAnnualLetterCount,
        node.YearCounts[year]
      );
    });
  });

  timelineMinYear = validYears.length
    ? Math.min.apply(null, validYears)
    : 1836;

  timelineMaxYear = validYears.length
    ? Math.max.apply(null, validYears)
    : timelineMinYear;

  currentTimelineYear = timelineMinYear;
  window.currentTimelineYear = currentTimelineYear;

  let slider = document.getElementById("yearSlider");
  slider.min = String(timelineMinYear);
  slider.max = String(timelineMaxYear);
  slider.value = String(currentTimelineYear);

  document.getElementById("TimelineMinYear").textContent = timelineMinYear;
  document.getElementById("TimelineMaxYear").textContent = timelineMaxYear;
}

function targetDistanceForCount(count) {
  // Zero-letter people belong in a separate outer zone.
  if (!count) return 470;

  // Any person with at least one exchanged letter remains clearly inside
  // the zero-letter boundary.
  let normalized =
    Math.log(1 + count) /
    Math.log(1 + globalMaxAnnualLetterCount);

  return 365 - normalized * 260;
}

function seedTimelinePositions() {
  nodes[0].x = CENTER_X;
  nodes[0].y = CENTER_Y;
  nodes[0].fx = CENTER_X;
  nodes[0].fy = CENTER_Y;

  nodes.slice(1).forEach(function(node, i) {
    let angle = i * 2.399963229728653;
    let radius = 360 + (i % 4) * 20;

    node.x = CENTER_X + Math.cos(angle) * radius;
    node.y = CENTER_Y + Math.sin(angle) * radius;
  });
}

function rebuildTimelineForces(alpha) {
  if (!timelineSimulation) return;

  timelineSimulation
    .force(
      "radial",
      d3.forceRadial(
        function(d) {
          if (d.index === 0) return 0;
          return targetDistanceForCount(d.AnnualLetterCount);
        },
        CENTER_X,
        CENTER_Y
      ).strength(function(d) {
        return d.index === 0 ? 1 : 0.42;
      })
    )
    .force(
      "collision",
      d3.forceCollide()
        .radius(function(d) {
          if (d.index === 0) return d.Radius + 18;
          return nodePassesFilters(d) ? d.Radius + 7 : 0;
        })
        .strength(0.72)
        .iterations(1)
    )
    .force(
      "charge",
      d3.forceManyBody().strength(function(d) {
        if (d.index === 0) return -120;
        return nodePassesFilters(d) ? -12 : 0;
      })
    );

  timelineSimulation.alpha(alpha || 0.6).restart();
}

function startTimelineSimulation() {
  seedTimelinePositions();

  timelineSimulation = d3
    .forceSimulation(nodes)
    .velocityDecay(0.68)
    .alphaDecay(0.075)
    .alphaMin(0.012)
    .on("tick", updateNetworkGeometry);

  rebuildTimelineForces(1);
}

function updateTimelineYear(year, animate) {
  year = Number(year);

  if (!Number.isFinite(year)) return;

  currentTimelineYear = Math.max(
    timelineMinYear,
    Math.min(timelineMaxYear, year)
  );
  window.currentTimelineYear = currentTimelineYear;

  let totalLetters = 0;
  let activePeople = 0;

  nodes.slice(1).forEach(function(node) {
    node.AnnualLetterCount =
      Number(node.YearCounts[currentTimelineYear] || 0);

    totalLetters += node.AnnualLetterCount;

    if (node.AnnualLetterCount > 0) {
      activePeople += 1;
    }
  });

  let slider = document.getElementById("yearSlider");
  if (slider) slider.value = String(currentTimelineYear);

  document.getElementById("TimelineYear").textContent =
    String(currentTimelineYear);

  document.getElementById("TimelineSummary").textContent =
    totalLetters +
    (totalLetters === 1 ? " exchanged letter" : " exchanged letters") +
    " across " +
    activePeople +
    (activePeople === 1 ? " correspondent" : " correspondents");

  if (nodeGroupSelection) {
    nodeGroupSelection.classed("NoCorrespondencePerson", function(d) {
      return d.index !== 0 && d.AnnualLetterCount === 0;
    });
  }

  if (networkNodeSelection) {
    networkNodeSelection.classed("NoCorrespondence", function(d) {
      return d.index !== 0 && d.AnnualLetterCount === 0;
    });
  }

  if (networkCountLabelSelection) {
    networkCountLabelSelection
      .select("text")
      .text(function(link) {
        let node = getLinkTargetNode(link);
        return node ? node.AnnualLetterCount : "";
      });
  }

  if (timelineSimulation) {
    nodes.forEach(function(node) {
      if (node.index === 0) return;
      node.vx *= 0.18;
      node.vy *= 0.18;
    });

    rebuildTimelineForces(animate === false ? 0.20 : 0.32);
  }

  // If a person's detail panel is open, refresh its letters to the new year.
  if (
    window.selectedPersonIndex !== null &&
    window.selectedPersonIndex !== undefined
  ) {
    let selected = nodes[window.selectedPersonIndex];
    if (selected && selected.index !== 0) {
      renderRelatedLetterBrowser(selected);
    }
  }

  document.getElementById("NetworkStatus").textContent =
    currentTimelineYear +
    " · " +
    activePeople +
    " active correspondents";
}

function bindTimelineControls() {
  let slider = document.getElementById("yearSlider");
  if (!slider) return;

  slider.addEventListener("input", function() {
    updateTimelineYear(Number(slider.value), true);
  });
}

function getLinkTargetNode(link) {
  let targetIndex =
    link.target && link.target.index !== undefined
      ? link.target.index
      : link.target;

  return nodes[targetIndex];
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  let dx = x2 - x1;
  let dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    dx = px - x1;
    dy = py - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t =
    ((px - x1) * dx + (py - y1) * dy) /
    (dx * dx + dy * dy);

  t = Math.max(0, Math.min(1, t));

  let x = x1 + t * dx;
  let y = y1 + t * dy;
  let ox = px - x;
  let oy = py - y;

  return Math.sqrt(ox * ox + oy * oy);
}

function rectanglesOverlap(a, b, padding) {
  padding = padding || 0;

  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  );
}

function boxIntersectsNode(box, node, padding) {
  padding = padding || 0;

  let closestX = Math.max(
    box.x,
    Math.min(node.x, box.x + box.width)
  );

  let closestY = Math.max(
    box.y,
    Math.min(node.y, box.y + box.height)
  );

  let dx = node.x - closestX;
  let dy = node.y - closestY;
  let radius = node.Radius + padding;

  return dx * dx + dy * dy < radius * radius;
}

function boxIntersectsSegment(box, segment, padding) {
  padding = padding || 0;

  let cx = box.x + box.width / 2;
  let cy = box.y + box.height / 2;
  let radius =
    Math.sqrt(
      box.width * box.width +
      box.height * box.height
    ) / 2 + padding;

  return distancePointToSegment(
    cx,
    cy,
    segment.x1,
    segment.y1,
    segment.x2,
    segment.y2
  ) < radius;
}

function correspondenceSegmentForNode(node) {
  let dx = node.x - CENTER_X;
  let dy = node.y - CENTER_Y;
  let distance = Math.sqrt(dx * dx + dy * dy);

  if (!Number.isFinite(distance) || distance < 1) {
    return null;
  }

  let ux = dx / distance;
  let uy = dy / distance;

  return {
    x1: CENTER_X + ux * (nodes[0].Radius + 5),
    y1: CENTER_Y + uy * (nodes[0].Radius + 5),
    x2: node.x - ux * (node.Radius + 5),
    y2: node.y - uy * (node.Radius + 5)
  };
}

function findSafeCountLabelPosition(
  node,
  count,
  ownSegment,
  activeSegments,
  placedBoxes
) {
  let text = String(count);
  let width = Math.max(24, 14 + text.length * 8);
  let height = 20;

  let dx = ownSegment.x2 - ownSegment.x1;
  let dy = ownSegment.y2 - ownSegment.y1;
  let length = Math.sqrt(dx * dx + dy * dy);

  if (!length) return null;

  let ux = dx / length;
  let uy = dy / length;
  let px = -uy;
  let py = ux;

  // Try several positions along the line and on both sides of it.
  let alongValues = [0.72, 0.62, 0.80, 0.52, 0.88, 0.42];
  let sideOffsets = [18, -18, 28, -28, 38, -38, 0];

  for (let a = 0; a < alongValues.length; a++) {
    for (let s = 0; s < sideOffsets.length; s++) {
      let t = alongValues[a];
      let offset = sideOffsets[s];

      let cx =
        ownSegment.x1 +
        dx * t +
        px * offset;

      let cy =
        ownSegment.y1 +
        dy * t +
        py * offset;

      let box = {
        x: cx - width / 2,
        y: cy - height / 2,
        width: width,
        height: height,
        cx: cx,
        cy: cy
      };

      let hitsNode = nodes.some(function(other) {
        if (!nodePassesFilters(other)) return false;
        return boxIntersectsNode(box, other, 5);
      });

      if (hitsNode) continue;

      let hitsPlacedBox = placedBoxes.some(function(otherBox) {
        return rectanglesOverlap(box, otherBox, 5);
      });

      if (hitsPlacedBox) continue;

      let hitsOtherLine = activeSegments.some(function(segment) {
        if (segment.nodeIndex === node.index) return false;
        return boxIntersectsSegment(box, segment, 4);
      });

      if (hitsOtherLine) continue;

      return box;
    }
  }

  return null;
}

function updateCorrespondenceCountLabels(activeSegments) {
  if (!networkCountLabelSelection) return;

  let placedBoxes = [];

  networkCountLabelSelection.each(function(link) {
    let group = d3.select(this);
    let node = getLinkTargetNode(link);

    if (
      !node ||
      node.AnnualLetterCount <= 0 ||
      !nodePassesFilters(node)
    ) {
      group.style("display", "none");
      return;
    }

    let ownSegment = activeSegments.find(function(segment) {
      return segment.nodeIndex === node.index;
    });

    if (!ownSegment) {
      group.style("display", "none");
      return;
    }

    let box = findSafeCountLabelPosition(
      node,
      node.AnnualLetterCount,
      ownSegment,
      activeSegments,
      placedBoxes
    );

    // If no collision-free location is available, suppress the box rather
    // than placing it over a portrait, another label, or another line.
    if (!box) {
      group.style("display", "none");
      return;
    }

    placedBoxes.push(box);

    group
      .style("display", null)
      .attr(
        "transform",
        "translate(" + box.cx + "," + box.cy + ")"
      );

    group
      .select("rect")
      .attr("x", -box.width / 2)
      .attr("y", -box.height / 2)
      .attr("width", box.width)
      .attr("height", box.height);

    group
      .select("text")
      .text(node.AnnualLetterCount)
      .attr("x", 0)
      .attr("y", 0.5);
  });
}

function updateNetworkGeometry() {
  if (!networkLinkSelection || !nodeGroupSelection) return;

  // Maintain a true visual separation:
  // 1+ letters = inside the boundary
  // 0 letters = outside the boundary
  nodes.slice(1).forEach(function(node) {
    let dx = node.x - CENTER_X;
    let dy = node.y - CENTER_Y;
    let distance = Math.sqrt(dx * dx + dy * dy);

    if (!Number.isFinite(distance) || distance === 0) {
      let angle = node.index * 2.399963229728653;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      distance = 1;
    }

    if (node.AnnualLetterCount > 0 && distance > 382) {
      let scale = 382 / distance;
      node.x = CENTER_X + dx * scale;
      node.y = CENTER_Y + dy * scale;
      node.vx *= 0.25;
      node.vy *= 0.25;
    }

    if (node.AnnualLetterCount === 0 && distance < 425) {
      let scale = 425 / distance;
      node.x = CENTER_X + dx * scale;
      node.y = CENTER_Y + dy * scale;
      node.vx *= 0.25;
      node.vy *= 0.25;
    }
  });

  let activeSegments = [];

  networkLinkSelection.each(function(link) {
    let path = d3.select(this);
    let node = getLinkTargetNode(link);

    if (
      !node ||
      node.AnnualLetterCount <= 0 ||
      !nodePassesFilters(node)
    ) {
      path
        .classed("ActiveCorrespondenceLine", false)
        .style("display", "none")
        .attr("d", null);
      return;
    }

    let segment = correspondenceSegmentForNode(node);

    if (!segment) {
      path.style("display", "none").attr("d", null);
      return;
    }

    segment.nodeIndex = node.index;
    activeSegments.push(segment);

    path
      .classed("ActiveCorrespondenceLine", true)
      .style("display", null)
      .attr(
        "d",
        "M " +
          segment.x1 +
          " " +
          segment.y1 +
          " L " +
          segment.x2 +
          " " +
          segment.y2
      );
  });

  nodeGroupSelection.attr("transform", function(d) {
    return "translate(" + d.x + "," + d.y + ")";
  });

  networkNodeSelection.attr("cx", 0).attr("cy", 0);

  updateCorrespondenceCountLabels(activeSegments);
}
function initialViewTransform() {
  // Network is now centered in the SVG coordinate system. A very small
  // initial scale gives the outer ring breathing room inside the frame.
  let scale = 1.08;
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

  networkLinkSelection = linkLayer
    .selectAll("path")
    .data(links)
    .enter()
    .append("path")
    .attr("class", "RelationshipLine CorrespondenceYearLine")
    .attr("fill", "none");

  networkCountLabelSelection = countLabelLayer
    .selectAll("g.CorrespondenceCountLabel")
    .data(links)
    .enter()
    .append("g")
    .attr("class", "CorrespondenceCountLabel")
    .style("display", "none")
    .style("pointer-events", "none");

  networkCountLabelSelection
    .append("rect")
    .attr("class", "CorrespondenceCountBox")
    .attr("rx", 5)
    .attr("ry", 5);

  networkCountLabelSelection
    .append("text")
    .attr("class", "CorrespondenceCountText")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central");

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
  startTimelineSimulation();

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

  if (timelineSimulation) {
    rebuildTimelineForces(0.18);
  }
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
