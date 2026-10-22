// -----------------------
// Shared constants
// -----------------------
let FRIEND_COLOR = "#5f7f69";
let FRIEND_SECONDARY_COLOR = "#e1ece4";

let FAMILY_COLOR = "#8a5260";
let FAMILY_SECONDARY_COLOR = "#f2e5e8";

let ACQ_COLOR = "#a98245";
let ACQ_SECONDARY_COLOR = "#f4edde";

let GE_COLOR = "#6d1f2d";
let SEARCHED_NODE_COLOR = "#c19a57";

let MAGNIFYING_RATIO = 1;
let MARGIN = 20;
let WIDTH = 1300;
let HEIGHT = 1000;
let IMAGE_R = 80;

// -----------------------
// Images + names
// -----------------------
function setImage(imagePath, index) {
  images
    .append("pattern")
    .attr("id", "image_" + index)
    .attr("width", 1)
    .attr("height", 1)
    .attr("viewBox", "0 0 100 100")
    .append("svg:image")
    .attr("xlink:href", imagePath)
    .attr("width", 100)
    .attr("height", 100)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("y", 0)
    .attr("x", 0);
}

function parseFullName(node) {
  let name = (node["Last Name"] || "") + ",";
  name += " " + (node["First Name"] || "");

  if (node["Nickname"]) {
    name += ' "' + node["Nickname"] + '"';
  }

  if (node["Second Names"]) {
    name += " " + node["Second Names"];
  }

  node["FullName"] = name.trim();
  return node;
}

function relationshipColor(value) {
  let relationship = String(value || "").trim().toLowerCase();
  if (relationship === "friend") return FRIEND_COLOR;
  if (relationship === "family") return FAMILY_COLOR;
  return ACQ_COLOR;
}

function relationshipSecondaryColor(value) {
  let relationship = String(value || "").trim().toLowerCase();
  if (relationship === "friend") return FRIEND_SECONDARY_COLOR;
  if (relationship === "family") return FAMILY_SECONDARY_COLOR;
  return ACQ_SECONDARY_COLOR;
}

// -----------------------
// Hover + selection
// -----------------------
function visualRadiusForState(data, state) {
  let base = Number(data && data.Radius ? data.Radius : 18);
  if (state === "selected") return Math.max(base + 12, 30);
  if (state === "hover") return Math.max(base + 6, 24);
  return base;
}

function setNodeVisualState(data, state) {
  if (!data || data.index === 0) return;

  let group = d3.select("#" + data.nodeId);
  if (group.empty()) return;

  let radius = visualRadiusForState(data, state);

  group
    .select(".RelationshipNode")
    .interrupt()
    .transition()
    .duration(160)
    .attr("r", radius);

  group
    .select(".NodeHitArea")
    .attr("r", radius + 8);

  group
    .select(".NodeInitials")
    .interrupt()
    .transition()
    .duration(160)
    .style("font-size", state === "selected" ? "16px" : state === "hover" ? "14px" : null)
    .style("font-weight", state === "base" ? null : "700");
}

function clearSelectedNodeLabel() {
  d3.selectAll(".NodeSelectedLabel").remove();
}

function showSelectedNodeLabel(data) {
  clearSelectedNodeLabel();
  if (!data || data.index === 0) return;

  let group = d3.select("#" + data.nodeId);
  if (group.empty()) return;

  group
    .append("text")
    .attr("class", "NodeSelectedLabel")
    .attr("text-anchor", "middle")
    .attr("y", visualRadiusForState(data, "selected") + 24)
    .style("font-family", "'Libre Baskerville', serif")
    .style("font-size", "18px")
    .style("font-weight", "700")
    .style("paint-order", "stroke")
    .style("stroke", "#f7f1e7")
    .style("stroke-width", "5px")
    .style("stroke-linejoin", "round")
    .style("fill", "#2f2924")
    .style("pointer-events", "none")
    .text(data.FullName || "");
}
function selectNode(node, data) {
  data = data || node.data()[0];
  if (!data || data.index === 0) return;

  d3.selectAll(".NodeHoverLabel").remove();

  node.classed("NodeHover", true);

  let isSelected = window.selectedPersonIndex === data.index;
  setNodeVisualState(data, isSelected ? "selected" : "hover");
  showHoverName(node, data);
  highlightPersonLink(data.index, true);
}

function deselectNode(node, data) {
  data = data || node.data()[0];
  if (!data) return;

  node.classed("NodeHover", false);

  let isSelected = window.selectedPersonIndex === data.index;
  setNodeVisualState(data, isSelected ? "selected" : "base");

  d3.selectAll(".NodeHoverLabel").remove();

  if (!window.selectedPersonIndex || window.selectedPersonIndex !== data.index) {
    highlightPersonLink(data.index, false);
  }
}

function showHoverName(node, data) {
  data = data || node.data()[0];
  if (!data || data.index === 0) return;

  d3.selectAll(".NodeHoverLabel").remove();

  // Use a dedicated layer above every node so other portraits never cover
  // the hover label. The layer is inside zoomLayer, so it pans/zooms naturally.
  let group = labelLayer
    .append("g")
    .attr("class", "NodeHoverLabel")
    .attr(
      "transform",
      "translate(" + data.x + "," +
        (data.y + visualRadiusForState(
          data,
          window.selectedPersonIndex === data.index ? "selected" : "hover"
        ) + 28) + ")"
    );

  let text = group
    .append("text")
    .attr("class", "NodeHoverName")
    .attr("x", 0)
    .attr("y", 0)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "18px")
    .style("font-weight", "700")
    .text(function() {
      let count = Number(data.AnnualLetterCount || 0);
      return data.FullName +
        " · " +
        count +
        (count === 1 ? " letter" : " letters");
    });

  // Measure the rendered text and place a small archival plaque behind it.
  let box = text.node().getBBox();

  group
    .insert("rect", "text")
    .attr("class", "NodeHoverPlaque")
    .attr("x", box.x - 7)
    .attr("y", box.y - 4)
    .attr("width", box.width + 14)
    .attr("height", box.height + 8)
    .attr("rx", 1)
    .attr("ry", 1);
}

function setSelectedPerson(data) {
  window.selectedPersonIndex = data ? data.index : null;

  d3.selectAll(".PersonNode").each(function(d) {
    if (!d || d.index === 0) return;
    setNodeVisualState(d, data && d.index === data.index ? "selected" : "base");
  });

  clearSelectedNodeLabel();
  if (data) showSelectedNodeLabel(data);

  d3.selectAll(".RelationshipNode")
    .classed("NodeSelected", function(d) {
      return data && d.index === data.index;
    })
    .classed("NodeContext", function(d) {
      return data && d.index !== 0 && d.index !== data.index;
    });

  d3.selectAll(".RelationshipLine")
    .classed("LineSelected", function(d) {
      let targetIndex = d.target.index !== undefined ? d.target.index : d.target;
      return data && targetIndex === data.index;
    });

  if (data) {
    highlightPersonLink(data.index, true);
  }
}

function highlightPersonLink(index, on) {
  d3.selectAll(".RelationshipLine")
    .classed("LineHover", function(d) {
      let targetIndex = d.target.index !== undefined ? d.target.index : d.target;
      return on && targetIndex === index;
    });
}

// -----------------------
// Biography
// -----------------------
function showSummary(node) {
  let data = node && node.data ? node.data()[0] : null;
  if (!data || data.index === 0) return;

  setSelectedPerson(data);

  if (typeof showSummaryForData === "function") {
    showSummaryForData(data);
  }
}

function handleBiographyText(biography) {
  return biography ? biography : "No biography is currently available.";
}

function clearDisplay(clearSelection = true) {
  document.getElementById("BiographyPhoto").src = "";
  document.getElementById("BiographyName").innerHTML = "";
  document.getElementById("BirthAndDeath").innerHTML = "";
  document.getElementById("BiographyRelationship").innerHTML = "";
  document.getElementById("BiographySummary").innerHTML = "";
  document.getElementById("BiographyLetters").innerHTML = "";
  document.getElementById("Biography").style.display = "none";
  document.getElementById("Biography").classList.remove("BiographyActive");

  if (clearSelection) {
    window.selectedPersonIndex = null;
    clearSelectedNodeLabel();
    d3.selectAll(".PersonNode").each(function(d) {
      if (!d || d.index === 0) return;
      setNodeVisualState(d, "base");
    });
    d3.selectAll(".RelationshipNode")
      .classed("NodeSelected", false)
      .classed("NodeContext", false);

    d3.selectAll(".RelationshipLine")
      .classed("LineSelected", false)
      .classed("LineHover", false);
  }
}

function getBirthDeathDates(birth, death) {
  if (birth && death) return birth + " – " + death;
  if (birth) return "Born " + birth;
  if (death) return "Died " + death;
  return "";
}

// -----------------------
// Related-letter browser
// -----------------------
function renderRelatedLetterBrowser(data) {
  let container = document.getElementById("BiographyLetters");
  container.innerHTML = "";

  let selectedYear = Number(window.currentTimelineYear);
  let selectedMonth = window.currentTimelineMonth;
  let selectedRange = window.currentTimelineRange;
  let rangeStart = selectedRange ? Number(selectedRange.start) : null;
  let rangeEnd = selectedRange ? Number(selectedRange.end) : null;
  let hasRange =
    selectedRange &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd);

  let allLetters =
    typeof getLettersForNode === "function"
      ? getLettersForNode(data)
      : [];

  function cleanLetterTitle(letter) {
    let value = letter.displayTitle || letter.title || "";
    return value
      .replace(/\s*\(\d+\s*:\s*[^)]+\)\s*$/, "")
      .trim();
  }

  function extractYear(letter) {
    if (
      letter.year !== null &&
      letter.year !== undefined &&
      letter.year !== "" &&
      Number.isFinite(Number(letter.year)) &&
      Number(letter.year) >= 1700
    ) {
      return Number(letter.year);
    }

    let title = cleanLetterTitle(letter).replace(
      /\[\s*(\d{1,4})\s*\??\s*\]/g,
      "$1"
    );

    let regex = /(?:^|[^\d])((?:17|18|19)\d{2})(?!\d)/g;
    let matches = [];
    let match;

    while ((match = regex.exec(title)) !== null) {
      matches.push(Number(match[1]));
    }

    if (!matches.length) return null;

    return matches[matches.length - 1];
  }

  function extractCorrespondent(letter) {
    let title = cleanLetterTitle(letter);
    let lower = title.toLowerCase();
    let separatorIndex = lower.indexOf(" to ");

    if (separatorIndex === -1) return "";

    let sender = title.slice(0, separatorIndex).trim();
    let recipientAndRest = title.slice(separatorIndex + 4).trim();
    let recipient = recipientAndRest.split(",")[0].trim();

    if (letter.relationType === "To") return sender;
    if (letter.relationType === "From") return recipient;

    return "";
  }

  allLetters.forEach(function(letter) {
    letter.year = extractYear(letter);
    letter.correspondent = extractCorrespondent(letter);
  });

  // The timeline controls either one year or an inclusive year range.
  // Unknown-date letters remain excluded because they cannot be placed reliably.
  let letters = allLetters.filter(function(letter) {
    if (!Number.isFinite(letter.year)) return false;
    if (hasRange) return letter.year >= rangeStart && letter.year <= rangeEnd;
    if (Number.isFinite(selectedYear) && letter.year === selectedYear) {
      if (selectedMonth === null || selectedMonth === undefined || selectedMonth === "") return true;
      let letterMonth = letter.month || "unknown";
      return String(letterMonth) === String(selectedMonth);
    }
    return false;
  });

  let selectionText = hasRange
    ? (rangeStart === rangeEnd ? String(rangeStart) : rangeStart + "–" + rangeEnd)
    : (Number.isFinite(selectedYear) ? ((selectedMonth ? (selectedMonth === "unknown" ? "Unknown month " : ["","January","February","March","April","May","June","July","August","September","October","November","December"][Number(selectedMonth)] + " ") : "") + String(selectedYear)) : "");

  let yearNote = document.createElement("div");
  yearNote.className = "TimelineLettersYear";
  yearNote.textContent = selectionText ? "Letters in " + selectionText : "Letters";
  container.appendChild(yearNote);

  if (!letters.length) {
    let empty = document.createElement("div");
    empty.className = "LetterEmpty";
    empty.textContent = selectionText
      ? "No dated related letters are listed for this person in " + selectionText + "."
      : "No dated related letters are listed for this person.";
    container.appendChild(empty);
    return;
  }

  let activeType = "All";
  let relationOrder = ["All", "To", "From", "About"];

  let tabs = document.createElement("div");
  tabs.className = "LetterTabs";

  let tabButtons = {};

  relationOrder.forEach(function(type) {
    let button = document.createElement("button");
    button.type = "button";
    button.className = "LetterTab";
    button.dataset.type = type;
    button.textContent = type;

    if (type === activeType) {
      button.classList.add("Active");
    }

    button.addEventListener("click", function() {
      activeType = type;

      Object.keys(tabButtons).forEach(function(key) {
        tabButtons[key].classList.toggle("Active", key === activeType);
      });

      rebuildCorrespondentOptions();
      draw();
    });

    tabButtons[type] = button;
    tabs.appendChild(button);
  });

  let controls = document.createElement("div");
  controls.className = "LetterFilterControls TimelineLetterControls";

  let correspondentLabel = document.createElement("label");
  correspondentLabel.className = "LetterFilterLabel";
  correspondentLabel.textContent = "Correspondent";

  let correspondentSelect = document.createElement("select");
  correspondentSelect.className = "LetterFilterSelect";
  correspondentLabel.appendChild(correspondentSelect);

  let search = document.createElement("input");
  search.className = "LetterSearch";
  search.placeholder = "Search letters…";

  controls.appendChild(correspondentLabel);
  controls.appendChild(search);

  let list = document.createElement("div");
  list.className = "LetterList";

  container.appendChild(tabs);
  container.appendChild(controls);
  container.appendChild(list);

  function activeLetters() {
    if (activeType === "All") return letters.slice();

    return letters.filter(function(letter) {
      return letter.relationType === activeType;
    });
  }

  function rebuildCorrespondentOptions() {
    let values = {};

    activeLetters().forEach(function(letter) {
      if (
        (letter.relationType === "To" || letter.relationType === "From") &&
        letter.correspondent
      ) {
        values[letter.correspondent] = true;
      }
    });

    let correspondents = Object.keys(values).sort(function(a, b) {
      return a.localeCompare(b);
    });

    correspondentSelect.innerHTML = "";

    let all = document.createElement("option");
    all.value = "all";
    all.textContent = "All people";
    correspondentSelect.appendChild(all);

    correspondents.forEach(function(name) {
      let option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      correspondentSelect.appendChild(option);
    });

    correspondentSelect.disabled =
      activeType === "About" || correspondents.length === 0;
  }

  function appendLetterRow(letter, parent) {
    let row = document.createElement("div");
    row.className = "LetterRow";

    let link = document.createElement("a");
    link.href = letter.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = cleanLetterTitle(letter) || "View digital letter";

    row.appendChild(link);
    parent.appendChild(row);
  }

  function draw() {
    let term = search.value.trim().toLowerCase();
    let selectedCorrespondent = correspondentSelect.value;

    list.innerHTML = "";

    let filtered = activeLetters().filter(function(letter) {
      if (
        selectedCorrespondent !== "all" &&
        letter.correspondent !== selectedCorrespondent
      ) {
        return false;
      }

      let haystack = [
        cleanLetterTitle(letter),
        letter.correspondent,
        letter.relationType
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !term || haystack.includes(term);
    });

    let summary = document.createElement("div");
    summary.className = "LetterTabSummary";
    summary.textContent =
      filtered.length === 1
        ? "1 letter"
        : filtered.length + " letters";
    list.appendChild(summary);

    if (!filtered.length) {
      let none = document.createElement("div");
      none.className = "LetterEmpty";
      none.textContent = "No letters match these filters.";
      list.appendChild(none);
      return;
    }

    if (activeType === "All") {
      ["To", "From", "About"].forEach(function(type) {
        let group = filtered.filter(function(letter) {
          return letter.relationType === type;
        });

        if (!group.length) return;

        let block = document.createElement("div");
        block.className = "LetterReferenceGroup";

        let heading = document.createElement("div");
        heading.className = "LetterReferenceHeader";

        let strong = document.createElement("strong");
        strong.textContent = type;

        heading.appendChild(strong);
        block.appendChild(heading);

        group.forEach(function(letter) {
          appendLetterRow(letter, block);
        });

        list.appendChild(block);
      });
    } else {
      filtered.forEach(function(letter) {
        appendLetterRow(letter, list);
      });
    }
  }

  correspondentSelect.addEventListener("change", draw);
  search.addEventListener("input", draw);

  rebuildCorrespondentOptions();
  draw();
}

// -----------------------
// Original utilities
// -----------------------
let setIndex = (function() {
  let index = 1;
  return function(node) {
    node.index = index;
    index++;
    return node;
  };
})();

d3.selection.prototype.moveToFront = function() {
  return this.each(function() {
    this.parentNode.appendChild(this);
  });
};

function capitalizeWords(value) {
  return String(value || "")
    .split(/\s+/)
    .map(function(word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
