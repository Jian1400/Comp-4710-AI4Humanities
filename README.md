# George Eliot Archive Social Network Visualizations

This repository contains interactive visualizations built for the George Eliot Archive project.

The main visualizations are:

- **Social Network Visualization** — explores people connected to George Eliot using the Archive's predefined closeness values, relationship type, gender, and linked-letter data.
- **Correspondence Timeline Visualization** — explores how George Eliot's correspondence changes across individual years and ranges of years.

## Running the Visualizations Locally

The visualizations load data from files in the repository, so they should be opened through a local web server rather than by double-clicking `index.html`.

### 1. Clone or Download the Repository

If you are using Git:

```bash
git clone https://github.com/Jian1400/Comp-4710-AI4Humanities.git
cd Comp-4710-AI4Humanities
```

If you already have the repository on your computer, open a terminal and navigate to the repository folder instead.

For example:

```bash
cd ~/Downloads/Comp-4710-AI4Humanities-git
```

### 2. Start a Local Web Server

From the **root folder of the repository**, run:

```bash
python3 -m http.server 8000
```

You should see output similar to:

```text
Serving HTTP on 0.0.0.0 port 8000 ...
```

Leave this terminal window open while using the visualizations.

### 3. Open the Visualizations

Open a web browser and go to:

**Social Network Visualization**

```text
http://localhost:8000/network_visualization/
```

**Correspondence Timeline Visualization**

```text
http://localhost:8000/timeline_visualization/
```

You can also open the repository root at:

```text
http://localhost:8000/
```

and navigate into either visualization folder.

## Repository Structure

```text
Comp-4710-AI4Humanities/
├── Datasets/
│   └── UpdatedGeorgeEliotGallery.csv
├── network_visualization/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── images/
└── timeline_visualization/
    ├── index.html
    ├── css/
    ├── js/
    └── images/
```

Both visualizations use data from:

```text
Datasets/UpdatedGeorgeEliotGallery.csv
```

Because the visualization files reference the dataset using repository-relative paths, the local server should be started from the repository root.

## Stopping the Local Server

Return to the terminal window running the server and press:

```text
Control + C
```

## Troubleshooting

If `python3` is not recognized, verify that Python 3 is installed:

```bash
python3 --version
```

If port `8000` is already in use, start the server on another port:

```bash
python3 -m http.server 8080
```

Then use:

```text
http://localhost:8080/network_visualization/
http://localhost:8080/timeline_visualization/
```

If the page opens but the visualization or data does not load, make sure the server was started from the repository root rather than from inside one of the visualization folders.
