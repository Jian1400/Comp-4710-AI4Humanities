// -----------------------------------------------------------------------------
// George Eliot correspondence matrix + annual bar timeline
// New visualization prototype. It intentionally lives separately from the
// existing force-directed correspondence timeline.
// Single data source: ../Datasets/UpdatedGeorgeEliotGallery.csv
// -----------------------------------------------------------------------------

let people = [];
let galleryLettersByPerson = {};
let allYears = [];
let minYear = null;
let maxYear = null;
let visibleStartYear = null;
let visibleEndYear = null;
let selectedYear = null;
let drillYear = null;
let selectedMonth = null;
let selectedPerson = null;
let relationshipFilter = "all";
let genderFilter = "all";
let hideInactive = false;
let rowSort = "alpha";
let rowHeight = 34;
let chartMarginLeft = 190;
let chartMarginRight = 22;
let headerHeight = 160;
let barTop = 24;
let barBottom = 118;
let redrawTimer = null;

window.currentTimelineYear = null;
window.currentTimelineRange = null;

function normalizeLookupName(name) {
  if (!name) return "";
  let value = String(name)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["“”][^"“”]+["“”]/g, " ")
    .replace(/\b(Mr|Mrs|Miss|Ms|Dr|Sir|Lady)\.?\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (value.includes(",")) {
    let commaIndex = value.indexOf(",");
    let last = value.slice(0, commaIndex).trim();
    let first = value.slice(commaIndex + 1).trim();
    value = first + " " + last;
  }

  return value.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
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
  let match = String(title || "").match(/\((\d{4})\s*[-–—]\s*(\d{4})\)\s*$/);
  return match ? { birth: match[1], death: match[2] } : { birth: "", death: "" };
}

function firstGalleryImage(value) {
  if (!value) return "";
  return String(value).split(",").map(function(item) { return item.trim(); }).filter(Boolean)[0] || "";
}

function normalizeRelationship(value) {
  return String(value || "").trim().toLowerCase() === "family" ? "family" : "friend";
}

function normalizeGender(value) {
  let v = String(value || "").trim().toLowerCase();
  if (["f", "female", "woman", "women"].indexOf(v) !== -1) return "female";
  if (["m", "male", "man", "men"].indexOf(v) !== -1) return "male";
  return "unknown";
}

function extractItemIdFromUrl(url) {
  let match = String(url || "").match(/\/items\/show\/(\d+)/);
  return match ? match[1] : "";
}

function extractReferenceFromTitle(title) {
  let matches = String(title || "").match(/\((\d+\s*:\s*[^)]+)\)\s*$/);
  return matches ? matches[1].replace(/[–—]/g, "-").replace(/\s*:\s*/g, ":").trim() : "";
}

function extractLetterMonthFromTitle(title) {
  // Keep brackets/question marks because uncertain dates such as [May?], ?May,
  // and May? still contain useful month information. Only remove the trailing
  // archive identifier before normalizing punctuation.
  let clean = String(title || "")
    .replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "")
    .toLowerCase()
    .replace(/[“”"']/g, " ")
    .replace(/[\[\]{}()?,;:!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let monthPatterns = [
    { month: 1,  pattern: /(?:^|[^a-z])jan(?:uary)?\.?(?=[^a-z]|$)/i },
    { month: 2,  pattern: /(?:^|[^a-z])feb(?:ruary)?\.?(?=[^a-z]|$)/i },
    { month: 3,  pattern: /(?:^|[^a-z])mar(?:ch)?\.?(?=[^a-z]|$)/i },
    { month: 4,  pattern: /(?:^|[^a-z])apr(?:il)?\.?(?=[^a-z]|$)/i },
    { month: 5,  pattern: /(?:^|[^a-z])may\.?(?=[^a-z]|$)/i },
    { month: 6,  pattern: /(?:^|[^a-z])jun(?:e)?\.?(?=[^a-z]|$)/i },
    { month: 7,  pattern: /(?:^|[^a-z])jul(?:y)?\.?(?=[^a-z]|$)/i },
    { month: 8,  pattern: /(?:^|[^a-z])aug(?:ust)?\.?(?=[^a-z]|$)/i },
    { month: 9,  pattern: /(?:^|[^a-z])sept?(?:ember)?\.?(?=[^a-z]|$)/i },
    { month: 10, pattern: /(?:^|[^a-z])oct(?:ober)?\.?(?=[^a-z]|$)/i },
    { month: 11, pattern: /(?:^|[^a-z])nov(?:ember)?\.?(?=[^a-z]|$)/i },
    { month: 12, pattern: /(?:^|[^a-z])dec(?:ember)?\.?(?=[^a-z]|$)/i }
  ];

  for (let i = 0; i < monthPatterns.length; i++) {
    if (monthPatterns[i].pattern.test(clean)) return monthPatterns[i].month;
  }
  return null;
}

function extractLetterYearFromTitle(title) {
  let clean = String(title || "")
    .replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "")
    .replace(/\[\s*(\d{1,4})\s*\??\s*\]/g, "$1")
    .trim();
  let regex = /(?:^|[^\d])((?:17|18|19)\d{2})(?!\d)/g;
  let matches = [];
  let match;
  while ((match = regex.exec(clean)) !== null) matches.push(Number(match[1]));
  return matches.length ? matches[matches.length - 1] : null;
}

function addDirectGalleryLetter(personName, letter) {
  let key = normalizeLookupName(personName);
  if (!key || !letter || !letter.url || !letter.title) return;
  if (!galleryLettersByPerson[key]) galleryLettersByPerson[key] = [];

  let duplicate = galleryLettersByPerson[key].some(function(existing) {
    return existing.url === letter.url && existing.relationType === letter.relationType;
  });
  if (!duplicate) galleryLettersByPerson[key].push(letter);
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
      if (["To", "From", "About"].indexOf(heading) !== -1) relationType = heading;
      return;
    }
    if (tag !== "a" || !relationType) return;

    let url = element.getAttribute("href") || "";
    let title = element.textContent.trim();
    addDirectGalleryLetter(personName, {
      relationType: relationType,
      title: title,
      displayTitle: title.replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "").trim(),
      url: url,
      itemId: extractItemIdFromUrl(url),
      identifier: extractReferenceFromTitle(title),
      year: extractLetterYearFromTitle(title),
      month: extractLetterMonthFromTitle(title)
    });
  });
}

function personLookupCandidates(data) {
  return [data.FullName, data.RawTitle]
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

function getCorrespondenceLetters(data) {
  return getLettersForNode(data).filter(function(letter) {
    return (letter.relationType === "To" || letter.relationType === "From") && letter.year !== null && letter.year !== undefined && Number.isFinite(Number(letter.year)) && Number(letter.year) >= 1700;
  });
}

function aliasSearchText(row, fullName) {
  let terms = [fullName, row["Dublin Core:Title"] || ""];
  Object.keys(row).forEach(function(key) {
    if (/alias|alternate|alternative|nickname|maiden|married|former|other name/i.test(key)) {
      terms.push(row[key] || "");
    }
  });
  return terms.join(" ").toLowerCase();
}

Promise.all([
  d3.csv("../Datasets/UpdatedGeorgeEliotGallery.csv"),
  d3.csv("../Datasets/UpdatedGeorgeEliotGallery.csv")
]).then(function(results) {
  let rows = results[0];
  let relationRows = results[1];

  relationRows.forEach(function(row) {
    parseUpdatedRelation(row["Dublin Core:Title"], row["Dublin Core:Relation"]);
  });

  people = rows.map(function(row, index) {
    let fullName = galleryDisplayName(row["Dublin Core:Title"]);
    let dates = galleryBirthDeath(row["Dublin Core:Title"]);
    return {
      index: index + 1,
      FullName: fullName,
      RawTitle: row["Dublin Core:Title"],
      Birth: dates.birth,
      Death: dates.death,
      Biography: row["Dublin Core:Description"] || "",
      Image: firstGalleryImage(row["file"]),
      Relationship: normalizeRelationship(row["Relationship"]),
      GenderNormalized: normalizeGender(row["Dublin Core:Type"]),
      SearchText: aliasSearchText(row, fullName),
      YearCounts: {},
      MonthCounts: {},
      TotalDatedLetters: 0
    };
  });

  let yearSet = {};
  people.forEach(function(person) {
    getCorrespondenceLetters(person).forEach(function(letter) {
      let year = Number(letter.year);
      person.YearCounts[year] = (person.YearCounts[year] || 0) + 1;
      if (!person.MonthCounts[year]) person.MonthCounts[year] = {};
      let monthKey = letter.month || "unknown";
      person.MonthCounts[year][monthKey] = (person.MonthCounts[year][monthKey] || 0) + 1;
      person.TotalDatedLetters += 1;
      yearSet[year] = true;
    });
  });

  allYears = Object.keys(yearSet).map(Number).sort(function(a,b) { return a-b; });
  minYear = allYears.length ? allYears[0] : 1836;
  maxYear = allYears.length ? allYears[allYears.length - 1] : minYear;
  visibleStartYear = minYear;
  visibleEndYear = maxYear;

  initializeControls();
  redraw();
}).catch(function(error) {
  console.error(error);
  document.getElementById("MatrixSummary").textContent = "Could not load the correspondence dataset.";
});

function yearsInWindow() {
  let years = [];
  for (let year = visibleStartYear; year <= visibleEndYear; year++) years.push(year);
  return years;
}

function personRangeCount(person) {
  let total = 0;
  for (let y = visibleStartYear; y <= visibleEndYear; y++) total += Number(person.YearCounts[y] || 0);
  return total;
}

function personPassesCategoryFilters(person) {
  if (relationshipFilter !== "all" && person.Relationship !== relationshipFilter) return false;
  if (genderFilter !== "all" && person.GenderNormalized !== genderFilter) return false;
  let term = document.getElementById("searchBar").value.trim().toLowerCase();
  if (term && !person.SearchText.includes(term)) return false;
  if (hideInactive && personRangeCount(person) === 0) return false;
  return true;
}


function personCorrespondenceYears(person) {
  return Object.keys(person.YearCounts || {})
    .map(Number)
    .filter(function(year) { return Number.isFinite(year) && Number(person.YearCounts[year] || 0) > 0; })
    .sort(function(a,b) { return a-b; });
}

function firstCorrespondenceYear(person) {
  let years = personCorrespondenceYears(person);
  return years.length ? years[0] : Infinity;
}

function lastCorrespondenceYear(person) {
  let years = personCorrespondenceYears(person);
  return years.length ? years[years.length - 1] : -Infinity;
}


function populationPeople() {
  let term = document.getElementById("searchBar").value.trim().toLowerCase();
  return people.filter(function(person) {
    if (relationshipFilter !== "all" && person.Relationship !== relationshipFilter) return false;
    if (genderFilter !== "all" && person.GenderNormalized !== genderFilter) return false;
    if (term && !person.SearchText.includes(term)) return false;
    return true;
  });
}

function fitRangeToCurrentPopulation() {
  let rows = populationPeople();
  let years = [];
  rows.forEach(function(person) {
    personCorrespondenceYears(person).forEach(function(year) { years.push(year); });
  });

  if (!years.length) {
    visibleStartYear = minYear;
    visibleEndYear = maxYear;
  } else {
    visibleStartYear = Math.min.apply(null, years);
    visibleEndYear = Math.max.apply(null, years);
  }

  drillYear = null;
  selectedMonth = null;
  selectedYear = null;
  window.currentTimelineMonth = null;
  syncRangeControls();
}

function visiblePeople() {
  let result = people.filter(personPassesCategoryFilters);
  if (rowSort === "range-desc") {
    result.sort(function(a,b) {
      return personRangeCount(b) - personRangeCount(a) || a.FullName.localeCompare(b.FullName);
    });
  } else if (rowSort === "range-asc") {
    result.sort(function(a,b) {
      return personRangeCount(a) - personRangeCount(b) || a.FullName.localeCompare(b.FullName);
    });
  } else if (rowSort === "first") {
    result.sort(function(a,b) {
      let ay = firstCorrespondenceYear(a);
      let by = firstCorrespondenceYear(b);
      return ay - by || a.FullName.localeCompare(b.FullName);
    });
  } else if (rowSort === "recent") {
    result.sort(function(a,b) {
      let ay = lastCorrespondenceYear(a);
      let by = lastCorrespondenceYear(b);
      return by - ay || a.FullName.localeCompare(b.FullName);
    });
  } else {
    result.sort(function(a,b) { return a.FullName.localeCompare(b.FullName); });
  }
  return result;
}

function annualUniqueCounts(rows) {
  let result = {};
  let included = {};
  rows.forEach(function(person) { included[person.index] = true; });

  rows.forEach(function(person) {
    getCorrespondenceLetters(person).forEach(function(letter) {
      let year = Number(letter.year);
      if (year < visibleStartYear || year > visibleEndYear) return;
      if (!result[year]) result[year] = {};
      let key = letter.url || [person.index, letter.relationType, letter.title].join("|");
      result[year][key] = true;
    });
  });

  let counts = {};
  Object.keys(result).forEach(function(year) { counts[year] = Object.keys(result[year]).length; });
  return counts;
}

function initializeControls() {
  buildSegments("relationshipFilters", [
    { value: "all", label: "All" }, { value: "family", label: "Family" }, { value: "friend", label: "Friend" }
  ], function(value) { relationshipFilter = value; fitRangeToCurrentPopulation(); redraw(); });

  buildSegments("genderFilters", [
    { value: "all", label: "All" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }
  ], function(value) { genderFilter = value; fitRangeToCurrentPopulation(); redraw(); });

  let resetFilters = document.getElementById("resetFiltersButton");
  if (resetFilters) resetFilters.addEventListener("click", function() {
    relationshipFilter = "all"; genderFilter = "all";
    document.querySelectorAll("#relationshipFilters .FilterSegment, #genderFilters .FilterSegment").forEach(function(b) {
      b.classList.toggle("Active", b.dataset.value === "all");
    });
    fitRangeToCurrentPopulation();
    redraw();
  });

  let start = document.getElementById("rangeStartSlider");
  let end = document.getElementById("rangeEndSlider");
  [start, end].forEach(function(slider) { slider.min = minYear; slider.max = maxYear; });
  start.value = minYear;
  end.value = maxYear;

  start.addEventListener("input", function() {
    visibleStartYear = Math.min(Number(start.value), visibleEndYear);
    start.value = visibleStartYear;
    redraw();
  });
  end.addEventListener("input", function() {
    visibleEndYear = Math.max(Number(end.value), visibleStartYear);
    end.value = visibleEndYear;
    redraw();
  });

  document.getElementById("sortRowsSelect").addEventListener("change", function(e) { rowSort = e.target.value; redraw(); });
  document.getElementById("hideInactiveToggle").addEventListener("change", function(e) { hideInactive = e.target.checked; redraw(); });
  document.getElementById("searchBar").addEventListener("input", function() { renderSearchResults(); fitRangeToCurrentPopulation(); redraw(); });
  document.getElementById("clearButton").addEventListener("click", function() {
    document.getElementById("searchBar").value = "";
    document.getElementById("searchResults").hidden = true;
    fitRangeToCurrentPopulation();
    redraw();
  });

  document.getElementById("zoomInButton").addEventListener("click", function() { zoomRange(0.68); });
  document.getElementById("zoomOutButton").addEventListener("click", function() { zoomRange(1.45); });
  document.getElementById("resetRangeButton").addEventListener("click", function() {
    visibleStartYear = minYear; visibleEndYear = maxYear; drillYear = null; selectedMonth = null; syncRangeControls(); redraw();
  });
  let backYears = document.getElementById("backToYearsButton");
  if (backYears) backYears.addEventListener("click", function() { drillYear = null; selectedMonth = null; selectedYear = null; window.currentTimelineMonth = null; redraw(); });

  document.getElementById("BackToMatrixButton").addEventListener("click", showExplorePanel);
  document.getElementById("closeSidebarButton").addEventListener("click", closeSidebar);
  document.getElementById("openSidebarButton").addEventListener("click", openSidebar);
  document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
  syncSidebarForViewport();
  window.addEventListener("resize", function() {
    syncSidebarForViewport();
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redraw, 100);
  });
}

function buildSegments(containerId, values, onChange) {
  let container = document.getElementById(containerId);
  values.forEach(function(entry, i) {
    let button = document.createElement("button");
    button.type = "button";
    let extraClass = entry.value === "family" ? " FilterFamily" : entry.value === "friend" ? " FilterFriend" : entry.value === "female" ? " FilterFemale" : entry.value === "male" ? " FilterMale" : "";
    button.className = "FilterSegment" + extraClass + (i === 0 ? " Active" : "");
    button.dataset.value = entry.value;
    button.textContent = entry.label;
    button.addEventListener("click", function() {
      Array.from(container.querySelectorAll(".FilterSegment")).forEach(function(b) { b.classList.remove("Active"); });
      button.classList.add("Active");
      onChange(entry.value);
    });
    container.appendChild(button);
  });
}

function syncRangeControls() {
  document.getElementById("rangeStartSlider").value = visibleStartYear;
  document.getElementById("rangeEndSlider").value = visibleEndYear;
}

function zoomRange(factor) {
  let span = visibleEndYear - visibleStartYear + 1;
  let newSpan = Math.round(span * factor);
  newSpan = Math.max(3, Math.min(maxYear - minYear + 1, newSpan));
  let center = selectedYear && selectedYear >= visibleStartYear && selectedYear <= visibleEndYear
    ? selectedYear
    : (visibleStartYear + visibleEndYear) / 2;
  let start = Math.round(center - (newSpan - 1) / 2);
  let end = start + newSpan - 1;
  if (start < minYear) { end += minYear - start; start = minYear; }
  if (end > maxYear) { start -= end - maxYear; end = maxYear; }
  visibleStartYear = Math.max(minYear, start);
  visibleEndYear = Math.min(maxYear, end);
  syncRangeControls();
  redraw();
}

function renderSearchResults() {
  let input = document.getElementById("searchBar");
  let results = document.getElementById("searchResults");
  let term = input.value.trim().toLowerCase();
  results.innerHTML = "";
  if (!term) { results.hidden = true; return; }
  let matches = people.filter(function(p) { return p.SearchText.includes(term); }).slice(0, 8);
  if (!matches.length) {
    let empty = document.createElement("div");
    empty.className = "SearchEmpty";
    empty.textContent = "No matching people";
    results.appendChild(empty);
  } else {
    matches.forEach(function(person) {
      let button = document.createElement("button");
      button.type = "button";
      button.className = "SearchResult";
      button.innerHTML = '<span class="SearchResultName"></span><span class="SearchResultType"></span>';
      button.querySelector(".SearchResultName").textContent = person.FullName;
      button.querySelector(".SearchResultType").textContent = capitalizeWords(person.Relationship);
      button.addEventListener("click", function() {
        input.value = person.FullName;
        results.hidden = true;
        fitRangeToCurrentPopulation();
        redraw();
      });
      results.appendChild(button);
    });
  }
  results.hidden = false;
}

function redraw() {
  if (!people.length) return;
  if (window.innerWidth <= 760) chartMarginLeft = 118; else chartMarginLeft = 190;
  headerHeight = window.innerWidth <= 760 ? 135 : 160;
  barBottom = headerHeight - 42;

  let rows = visiblePeople();
  let years = yearsInWindow();
  let counts = annualUniqueCounts(rows);

  document.getElementById("RangeStartReadout").textContent = visibleStartYear;
  document.getElementById("RangeEndReadout").textContent = visibleEndYear;

  let totalRangeLetters = Object.keys(counts).reduce(function(sum, year) { return sum + counts[year]; }, 0);
  let backYears = document.getElementById("backToYearsButton");
  if (drillYear !== null) {
    document.getElementById("MatrixSummary").textContent = rows.length + " people visible · monthly detail for " + drillYear + " · unknown-month letters kept separately";
    if (backYears) backYears.hidden = false;
    drawMonthBars(rows, drillYear);
    drawMonthMatrix(rows, drillYear);
  } else {
    document.getElementById("MatrixSummary").textContent = rows.length + " people visible · " + totalRangeLetters + " unique To/From letters across " + visibleStartYear + "–" + visibleEndYear;
    if (backYears) backYears.hidden = true;
    drawBars(rows, years, counts);
    drawMatrix(rows, years);
  }
}

function chartWidth(element) {
  return Math.max(520, element.clientWidth || 900);
}

function makeXScale(width) {
  return d3.scaleLinear().domain([visibleStartYear - 0.5, visibleEndYear + 0.5]).range([chartMarginLeft, width - chartMarginRight]);
}

function yearLabelsForWidth(years, x, width) {
  if (!years.length) return [];
  let minGap = width <= 700 ? 38 : 46;
  let candidates = [];
  let lastX = -Infinity;

  years.forEach(function(year) {
    let px = x(year);
    if (!candidates.length || px - lastX >= minGap) {
      candidates.push(year);
      lastX = px;
    }
  });

  let lastYear = years[years.length - 1];
  if (candidates[candidates.length - 1] !== lastYear) {
    let lastPx = x(lastYear);
    let previous = candidates[candidates.length - 1];
    if (previous === undefined || lastPx - x(previous) >= minGap) {
      candidates.push(lastYear);
    } else if (candidates.length > 1) {
      // Prefer the true end year over a nearly-adjacent penultimate label.
      candidates[candidates.length - 1] = lastYear;
    }
  }

  if (selectedYear !== null && years.indexOf(selectedYear) !== -1 && candidates.indexOf(selectedYear) === -1) {
    candidates = candidates.filter(function(year) {
      return Math.abs(x(year) - x(selectedYear)) >= minGap;
    });
    candidates.push(selectedYear);
    candidates.sort(function(a,b) { return a-b; });
  }
  return candidates;
}

function drawBars(rows, years, counts) {
  let host = document.getElementById("barHeader");
  host.innerHTML = "";
  let width = chartWidth(host);
  let svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + width + " " + headerHeight).attr("preserveAspectRatio", "none");
  let x = makeXScale(width);
  let maxCount = d3.max(years, function(y) { return Number(counts[y] || 0); }) || 1;
  let y = d3.scaleLinear().domain([0, maxCount]).nice().range([barBottom, barTop]);
  let step = Math.max(2, (width - chartMarginLeft - chartMarginRight) / Math.max(1, visibleEndYear - visibleStartYear + 1));
  let barWidth = Math.max(1.5, Math.min(18, step * 0.68));

  svg.append("text").attr("class", "AxisTitle").attr("x", 10).attr("y", 18).text("Unique To/From letters per year");
  svg.append("text").attr("class", "AxisHint").attr("x", 10).attr("y", 34).text("Click a bar to inspect that year by month");

  let barGroups = svg.selectAll("g.YearBarGroup").data(years).enter().append("g").attr("class", "YearBarGroup");
  barGroups.append("rect")
    .attr("class", function(year) { return "YearBar" + (year === selectedYear ? " SelectedYear" : ""); })
    .attr("x", function(year) { return x(year) - barWidth / 2; })
    .attr("y", function(year) { return y(Number(counts[year] || 0)); })
    .attr("width", barWidth)
    .attr("height", function(year) { return Math.max(1, barBottom - y(Number(counts[year] || 0))); });

  barGroups.append("rect")
    .attr("class", "YearBarHit")
    .attr("x", function(year) { return x(year) - Math.max(7, step/2); })
    .attr("y", barTop)
    .attr("width", function() { return Math.max(14, step); })
    .attr("height", barBottom - barTop + 25)
    .on("click", function(year) { selectYear(year); })
    .on("mousemove", function(year) { showTooltip(d3.event, null, year, Number(counts[year] || 0)); })
    .on("mouseleave", hideTooltip);

  let labelYears = yearLabelsForWidth(years, x, width);
  svg.selectAll("text.YearLabel").data(labelYears)
    .enter().append("text").attr("class", "YearLabel")
    .attr("x", function(year) { return x(year); }).attr("y", headerHeight - 18)
    .attr("text-anchor", "middle").text(function(year) { return year; });

  if (selectedYear !== null && selectedYear >= visibleStartYear && selectedYear <= visibleEndYear) {
    svg.append("line").attr("class", "YearGridLine SelectedYear").attr("x1", x(selectedYear)).attr("x2", x(selectedYear)).attr("y1", barTop).attr("y2", headerHeight);
  }
}

function drawMatrix(rows, years) {
  let host = document.getElementById("matrixBody");
  host.innerHTML = "";
  if (!rows.length) {
    let empty = document.createElement("div"); empty.className = "EmptyRangeMessage"; empty.textContent = "No people match the current filters."; host.appendChild(empty); return;
  }
  let width = chartWidth(host.parentElement);
  let height = Math.max(rows.length * rowHeight, 120);
  let x = makeXScale(width);
  let maxDotCount = d3.max(rows, function(person) {
    return d3.max(years, function(year) { return Number(person.YearCounts[year] || 0); }) || 0;
  }) || 1;
  let r = d3.scaleSqrt().domain([1, maxDotCount]).range([3.5, 13]);
  let svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + width + " " + height).attr("height", height).attr("preserveAspectRatio", "none");

  years.forEach(function(year) {
    svg.append("line").attr("class", "YearGridLine" + (year === selectedYear ? " SelectedYear" : ""))
      .attr("x1", x(year)).attr("x2", x(year)).attr("y1", 0).attr("y2", height);
  });

  let rowGroups = svg.selectAll("g.PersonRow").data(rows).enter().append("g").attr("class", "PersonRow").attr("transform", function(d,i) { return "translate(0," + (i * rowHeight) + ")"; });
  rowGroups.append("rect").attr("class", function(d,i) { return "RowStripe" + (i % 2 ? " Alternate" : ""); }).attr("x", 0).attr("y", 0).attr("width", width).attr("height", rowHeight);
  rowGroups.append("line").attr("class", "RowLine").attr("x1", 0).attr("x2", width).attr("y1", rowHeight - .5).attr("y2", rowHeight - .5);

  rowGroups.append("text").attr("class", "PersonName").attr("x", 8).attr("y", 14)
    .text(function(person) { return person.FullName; })
    .on("click", function(person) { openPerson(person, null); });
  rowGroups.append("text").attr("class", "PersonMeta").attr("x", 8).attr("y", 26)
    .text(function(person) { return capitalizeWords(person.Relationship) + " · " + personRangeCount(person) + " in range"; });

  rowGroups.each(function(person) {
    let row = d3.select(this);
    let entries = years.map(function(year) { return { person: person, year: year, count: Number(person.YearCounts[year] || 0) }; }).filter(function(d) { return d.count > 0; });
    row.selectAll("circle.ActivityDot").data(entries).enter().append("circle")
      .attr("class", function(d) {
        let genderClass = d.person.GenderNormalized === "female" ? " GenderFemale" : d.person.GenderNormalized === "male" ? " GenderMale" : "";
        return "ActivityDot" + genderClass + (selectedPerson && selectedPerson.index === d.person.index && selectedYear === d.year ? " SelectedDot" : "");
      })
      .attr("cx", function(d) { return x(d.year); }).attr("cy", rowHeight / 2).attr("r", function(d) { return r(d.count); })
      .on("click", function(d) { openPerson(d.person, d.year); })
      .on("mousemove", function(d) { showTooltip(d3.event, d.person, d.year, d.count); })
      .on("mouseleave", hideTooltip);
  });
}


function monthBuckets() {
  return [
    { key: 1, label: "Jan" }, { key: 2, label: "Feb" }, { key: 3, label: "Mar" },
    { key: 4, label: "Apr" }, { key: 5, label: "May" }, { key: 6, label: "Jun" },
    { key: 7, label: "Jul" }, { key: 8, label: "Aug" }, { key: 9, label: "Sep" },
    { key: 10, label: "Oct" }, { key: 11, label: "Nov" }, { key: 12, label: "Dec" },
    { key: "unknown", label: "Unknown" }
  ];
}

function uniqueMonthCounts(rows, year) {
  let result = {};
  monthBuckets().forEach(function(m) { result[m.key] = {}; });
  rows.forEach(function(person) {
    getCorrespondenceLetters(person).forEach(function(letter) {
      if (Number(letter.year) !== Number(year)) return;
      let key = letter.month || "unknown";
      let unique = letter.url || [person.index, letter.relationType, letter.title].join("|");
      result[key][unique] = true;
    });
  });
  let counts = {};
  Object.keys(result).forEach(function(k) { counts[k] = Object.keys(result[k]).length; });
  return counts;
}

function makeMonthXScale(width) {
  return d3.scalePoint().domain(monthBuckets().map(function(m) { return String(m.key); })).range([chartMarginLeft + 8, width - chartMarginRight - 8]).padding(0.35);
}

function drawMonthBars(rows, year) {
  let host = document.getElementById("barHeader");
  host.innerHTML = "";
  let width = chartWidth(host);
  let svg = d3.select(host).append("svg").attr("viewBox", "0 0 " + width + " " + headerHeight).attr("preserveAspectRatio", "none");
  let buckets = monthBuckets();
  let counts = uniqueMonthCounts(rows, year);
  let x = makeMonthXScale(width);
  let maxCount = d3.max(buckets, function(m) { return counts[m.key] || 0; }) || 1;
  let y = d3.scaleLinear().domain([0, maxCount]).nice().range([barBottom, barTop]);
  let step = (width - chartMarginLeft - chartMarginRight) / buckets.length;
  let barWidth = Math.max(8, Math.min(34, step * 0.55));
  svg.append("text").attr("class", "AxisTitle").attr("x", 10).attr("y", 18).text("" + year + " correspondence by month");
  svg.append("text").attr("class", "AxisHint").attr("x", 10).attr("y", 34).text("Unknown = year is known, but no reliable month is stated");
  let g = svg.selectAll("g.MonthBarGroup").data(buckets).enter().append("g");
  g.append("rect").attr("class", function(m){ return "YearBar" + (String(selectedMonth) === String(m.key) ? " SelectedYear" : ""); })
    .attr("x", function(m){ return x(String(m.key)) - barWidth/2; }).attr("y", function(m){ return y(counts[m.key] || 0); })
    .attr("width", barWidth).attr("height", function(m){ return Math.max(1, barBottom - y(counts[m.key] || 0)); });
  g.append("rect").attr("class","YearBarHit").attr("x", function(m){ return x(String(m.key)) - Math.max(12, step/2); })
    .attr("y", barTop).attr("width", Math.max(24, step)).attr("height", barBottom-barTop+25)
    .on("click", function(m){ selectedMonth = m.key; window.currentTimelineYear = year; window.currentTimelineMonth = m.key; redraw(); })
    .on("mousemove", function(m){ showTooltip(d3.event, null, m.label + " " + year, counts[m.key] || 0); }).on("mouseleave", hideTooltip);
  svg.selectAll("text.YearLabel").data(buckets).enter().append("text").attr("class","YearLabel")
    .attr("x", function(m){ return x(String(m.key)); }).attr("y", headerHeight-18).attr("text-anchor","middle").text(function(m){ return m.label; });
}

function drawMonthMatrix(rows, year) {
  let host = document.getElementById("matrixBody"); host.innerHTML = "";
  if (!rows.length) { let empty=document.createElement("div"); empty.className="EmptyRangeMessage"; empty.textContent="No people match the current filters."; host.appendChild(empty); return; }
  let width = chartWidth(host.parentElement), height=Math.max(rows.length*rowHeight,120), x=makeMonthXScale(width), buckets=monthBuckets();
  let maxDotCount = d3.max(rows, function(person){ return d3.max(buckets, function(m){ return Number((person.MonthCounts[year]||{})[m.key]||0); })||0; })||1;
  let r=d3.scaleSqrt().domain([1,maxDotCount]).range([3.5,13]);
  let svg=d3.select(host).append("svg").attr("viewBox","0 0 "+width+" "+height).attr("height",height).attr("preserveAspectRatio","none");
  buckets.forEach(function(m){ svg.append("line").attr("class","YearGridLine"+(String(selectedMonth)===String(m.key)?" SelectedYear":""))
    .attr("x1",x(String(m.key))).attr("x2",x(String(m.key))).attr("y1",0).attr("y2",height); });
  let rowGroups=svg.selectAll("g.PersonRow").data(rows).enter().append("g").attr("class","PersonRow").attr("transform",function(d,i){return "translate(0,"+(i*rowHeight)+")";});
  rowGroups.append("rect").attr("class",function(d,i){return "RowStripe"+(i%2?" Alternate":"");}).attr("x",0).attr("y",0).attr("width",width).attr("height",rowHeight);
  rowGroups.append("line").attr("class","RowLine").attr("x1",0).attr("x2",width).attr("y1",rowHeight-.5).attr("y2",rowHeight-.5);
  rowGroups.append("text").attr("class","PersonName").attr("x",8).attr("y",14).text(function(p){return p.FullName;}).on("click",function(p){openPerson(p,year,null);});
  rowGroups.append("text").attr("class","PersonMeta").attr("x",8).attr("y",26).text(function(p){return capitalizeWords(p.Relationship)+" · "+Number(p.YearCounts[year]||0)+" in "+year;});
  rowGroups.each(function(person){ let row=d3.select(this); let entries=buckets.map(function(m){return {person:person, month:m.key, label:m.label, count:Number((person.MonthCounts[year]||{})[m.key]||0)};}).filter(function(d){return d.count>0;});
    row.selectAll("circle.ActivityDot").data(entries).enter().append("circle").attr("class",function(d){let gc=d.person.GenderNormalized==="female"?" GenderFemale":d.person.GenderNormalized==="male"?" GenderMale":""; return "ActivityDot"+gc+(selectedPerson&&selectedPerson.index===d.person.index&&String(selectedMonth)===String(d.month)?" SelectedDot":"");})
      .attr("cx",function(d){return x(String(d.month));}).attr("cy",rowHeight/2).attr("r",function(d){return r(d.count);})
      .on("click",function(d){selectedMonth=d.month; openPerson(d.person,year,d.month);}).on("mousemove",function(d){showTooltip(d3.event,d.person,d.label+" "+year,d.count);}).on("mouseleave",hideTooltip); });
}

function selectYear(year) {
  selectedYear = year;
  drillYear = year;
  selectedMonth = null;
  window.currentTimelineYear = year;
  window.currentTimelineRange = null;
  window.currentTimelineMonth = null;
  redraw();
}

function openPerson(person, year, month) {
  selectedPerson = person;
  let hasSelectedYear =
    year !== null &&
    year !== undefined &&
    year !== "" &&
    Number.isFinite(Number(year)) &&
    Number(year) >= 1700;

  if (hasSelectedYear) {
    selectedYear = Number(year);
    window.currentTimelineYear = selectedYear;
    window.currentTimelineRange = null;
    window.currentTimelineMonth = month || null;
  } else {
    window.currentTimelineYear = null;
    window.currentTimelineRange = { start: visibleStartYear, end: visibleEndYear };
  }

  document.getElementById("ExplorePanel").hidden = true;
  document.getElementById("PersonPanel").hidden = false;
  document.getElementById("BiographyName").textContent = person.FullName;
  document.getElementById("BirthAndDeath").textContent = getBirthDeathDates(person.Birth, person.Death);
  document.getElementById("BiographyRelationship").textContent = capitalizeWords(person.Relationship);
  document.getElementById("BiographySummary").innerHTML = handleBiographyText(person.Biography);
  let photo = document.getElementById("BiographyPhoto");
  if (person.Image) { photo.src = person.Image; photo.style.display = "block"; } else { photo.src = ""; photo.style.display = "none"; }
  renderRelatedLetterBrowser(person);
  openSidebar();
  redraw();
}

function showExplorePanel() {
  document.getElementById("ExplorePanel").hidden = false;
  document.getElementById("PersonPanel").hidden = true;
}

function openSidebar() {
  document.body.classList.remove("SidebarClosed");
  document.getElementById("sidebarBackdrop").hidden = window.innerWidth > 760;
  let button = document.getElementById("openSidebarButton");
  if (button) button.setAttribute("aria-expanded", "true");
}
function closeSidebar() {
  document.body.classList.add("SidebarClosed");
  document.getElementById("sidebarBackdrop").hidden = true;
  let button = document.getElementById("openSidebarButton");
  if (button) button.setAttribute("aria-expanded", "false");
}

function syncSidebarForViewport() {
  // Phones start graph-first. Desktop starts with the control rail open unless
  // the user has explicitly closed it during this session.
  if (window.innerWidth <= 760 && !document.body.dataset.sidebarInitialized) {
    document.body.classList.add("SidebarClosed");
  }
  document.body.dataset.sidebarInitialized = "true";
  let backdrop = document.getElementById("sidebarBackdrop");
  if (backdrop) backdrop.hidden = document.body.classList.contains("SidebarClosed") || window.innerWidth > 760;
}

function showTooltip(event, person, year, count) {
  let tooltip = document.getElementById("matrixTooltip");
  tooltip.hidden = false;
  tooltip.innerHTML = person
    ? "<strong>" + escapeHtml(person.FullName) + "</strong>" + year + " · " + count + (count === 1 ? " letter" : " letters") + "<br>Click to view the linked letters."
    : "<strong>" + year + "</strong>" + count + (count === 1 ? " unique letter" : " unique letters") + " among visible people.";
  let left = Math.min(window.innerWidth - 270, event.clientX + 14);
  let top = Math.min(window.innerHeight - 100, event.clientY + 14);
  tooltip.style.left = Math.max(8, left) + "px";
  tooltip.style.top = Math.max(8, top) + "px";
}
function hideTooltip() { document.getElementById("matrixTooltip").hidden = true; }
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function(ch) { return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]; });
}
