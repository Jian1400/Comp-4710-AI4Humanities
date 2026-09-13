let id_map = {};
let nameLabels = {};

Papa.parse('../letters_output.csv', {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    results.data.forEach(row => {
      const identifier = row['Dublin Core:Identifier'];
      const itemId = row['Item Id'];

      [row['Dublin Core:Subject'], row['Dublin Core:Creator']].forEach(name => {
        if (!name || name === 'George Eliot^^F') return; // skip blank/undefined names

        if (!id_map[identifier]) {
          id_map[identifier] = {};
        }
        if (!id_map[identifier][name]) {
          id_map[identifier][name] = [];
        }
        id_map[identifier][name].push(itemId);
      });
    });

    // id_map is fully built now — safe to load the second dataset
    loadGallery();
  },
  error: (err) => {
    document.getElementById('output').textContent = 'Failed to load letters CSV: ' + err.message;
  }
});

function loadGallery() {
  Papa.parse('../gallery_output.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      results.data.forEach(row => {
        const name = row['Dublin Core:Title'];
        const relation = row['Dublin Core:Relation'];

        if (!name || !relation) return;

        if (!nameLabels[name]) {
          nameLabels[name] = new Set();
        }

        // Split on commas, trim whitespace, drop empty entries, dedupe via Set
        relation.split(',')
          .map(label => label.trim())
          .filter(label => label.length > 0)
          .forEach(label => nameLabels[name].add(label));
      });

      renderNames();
    },
    error: (err) => {
      document.getElementById('output').textContent = 'Failed to load gallery CSV: ' + err.message;
    }
  });
}

function renderNames() {
  const output = document.getElementById('output');
  output.innerHTML = '';

  const sortedNames = Object.keys(nameLabels).sort();

  sortedNames.forEach(name => {
    const heading = document.createElement('h3');
    heading.textContent = name;
    output.appendChild(heading);

    const ul = document.createElement('ul');

    nameLabels[name].forEach(label => {
      const li = document.createElement('li');
      const itemIds = (id_map[label] && id_map[label][name]) || [];

      if (itemIds.length === 0) {
        // No matching item id found in id_map for this name/label combo
        li.textContent = `${label} (no item id found)`;
      } else {
        itemIds.forEach((itemId, i) => {
          const a = document.createElement('a');
          a.href = `https://georgeeliotarchive.org/items/show/${itemId}`;
          a.target = '_blank';
          a.textContent = label;
          li.appendChild(a);
          if (i < itemIds.length - 1) {
            li.appendChild(document.createTextNode(', '));
          }
        });
      }

      ul.appendChild(li);
    });

    output.appendChild(ul);
  });
}
