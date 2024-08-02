let svg, g, simulation, link, node, nodeLabels, width, height, zoom;
let graphData = { nodes: [], links: [] };
let nodeIds = [];

async function initializeGraph() {
    width = document.getElementById('graph').clientWidth;
    height = document.getElementById('graph').clientHeight;

    zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .filter(event => {
            return !event.target.classList.contains('node-label') || event.type !== 'dblclick';
        })
        .on("zoom", zoomed);

    svg = d3.select("#graph")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(zoom);

    svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#999");

    g = svg.append("g");

    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2));

    await fetchInitialNodeId();
    setupAutocomplete();
    await updateGraph();

    simulation.on("end", () => {
        centerGraph();
        const startNodeId = document.getElementById("start-node").dataset.selectedId;
        const startNode = graphData.nodes.find(n => n.id === startNodeId);
        if (startNode) {
            showNodeInfo(null, startNode);
        }
    });
}

async function fetchInitialNodeId() {
    try {
        const response = await fetch('/api/node_ids');
        const ids = await response.json();
        if (ids.length > 0) {
            const startNodeInput = document.getElementById("start-node");
            startNodeInput.value = ids[0];
            startNodeInput.dataset.selectedId = ids[0];
        }
    } catch (error) {
        console.error('Error fetching initial node ID:', error);
    }
}

function setupAutocomplete() {
    const input = document.getElementById("start-node");
    const autocompleteList = document.getElementById("autocomplete-list");

    input.addEventListener("input", debounce(async function () {
        const searchTerm = input.value;
        if (searchTerm.length < 2) {
            autocompleteList.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/node_ids?term=${searchTerm}`);
            const matchingIds = await response.json();
            displayAutocompleteResults(matchingIds);
        } catch (error) {
            console.error('Error fetching matching nodes:', error);
        }
    }, 300));

    document.addEventListener("click", function (e) {
        if (e.target !== input && e.target !== autocompleteList) {
            autocompleteList.innerHTML = '';
        }
    });
}


function displayAutocompleteResults(matchingIds) {
    const autocompleteList = document.getElementById("autocomplete-list");
    autocompleteList.innerHTML = '';

    matchingIds.forEach(id => {
        const div = document.createElement("div");
        div.textContent = id;
        div.addEventListener("click", function () {
            selectAutocompleteOption(this.textContent);
        });
        autocompleteList.appendChild(div);
    });
}

function selectAutocompleteOption(selectedId) {
    const input = document.getElementById("start-node");
    input.value = selectedId;
    input.dataset.selectedId = selectedId;
    document.getElementById("autocomplete-list").innerHTML = '';
    updateGraph();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function updateGraph() {
    const input = document.getElementById("start-node");
    let startNodeId = input.value.trim(); // Get the current value of the input

    // If the input is empty, fall back to the dataset selectedId
    if (!startNodeId && input.dataset.selectedId) {
        startNodeId = input.dataset.selectedId;
    }

    const forwardDepth = parseInt(document.getElementById("forward-depth").value);
    const backwardDepth = parseInt(document.getElementById("backward-depth").value);
    const edgeLimit = parseInt(document.getElementById("edge-limit").value);

    if (!startNodeId) {
        console.error('No start node selected');
        return;
    }

    try {
        const response = await fetch(`/api/subgraph?startNodeId=${startNodeId}&forwardDepth=${forwardDepth}&backwardDepth=${backwardDepth}&edgeLimit=${edgeLimit}`);
        graphData = await response.json();
    } catch (error) {
        console.error('Error fetching subgraph:', error);
        return;
    }

    renderGraph();
}

function renderGraph() {
    g.selectAll("*").remove();

    link = g.append("g")
        .selectAll("line")
        .data(graphData.links)
        .enter().append("line")
        .attr("class", "link")
        .attr("stroke", d => d.type === "output" ? "#1f77b4" : d.type === "input" ? "#2ca02c" : "#d62728")
        .attr("marker-end", "url(#arrowhead)");

    node = g.append("g")
        .selectAll("circle")
        .data(graphData.nodes)
        .enter().append("circle")
        .attr("class", d => d.id === document.getElementById("start-node").dataset.selectedId ? "node start-node" : "node")
        .attr("r", d => d.id === document.getElementById("start-node").dataset.selectedId ? 8 : 5)
        .attr("fill", d => d.type === "rule" ? "#ff7f0e" : "#1f77b4")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => { event.stopPropagation(); showNodeInfo(event, d); })
        .on("dblclick", (event, d) => { event.stopPropagation(); goToNode(d.id); });

    nodeLabels = g.append("g")
        .selectAll("text")
        .data(graphData.nodes)
        .enter().append("text")
        .attr("class", "node-id")
        .attr("dx", d => d.id === document.getElementById("start-node").dataset.selectedId ? 12 : 8)
        .attr("dy", ".35em")
        .text(d => d.id)
        .style("cursor", "pointer")
        .on("click", (event, d) => { event.stopPropagation(); showNodeInfo(event, d); })
        .on("dblclick", (event, d) => { event.stopPropagation(); goToNode(d.id); });

    simulation.nodes(graphData.nodes).on("tick", ticked);
    simulation.force("link").links(graphData.links);
    simulation.alpha(1).restart();

    setTimeout(() => {
        centerGraph();
        const startNodeId = document.getElementById("start-node").dataset.selectedId;
        showNodeInfo(null, graphData.nodes.find(n => n.id === startNodeId));
    }, 100);
}

function showNodeInfo(event, d) {
    const nodeInfo = document.getElementById("node-info");
    nodeInfo.innerHTML = `
        <h3>Node Information</h3>
        <p><strong>ID:</strong> ${d.id}</p>
        <p><strong>Type:</strong> ${d.type}</p>
        <p><strong>Description:</strong> ${d.description}</p>
        <button id="go-to-node-btn">Go To ${d.id}</button>
        <p><i>Click on a node to see its details here, or double click to change start node.</i></p>
    `;

    document.getElementById("go-to-node-btn").addEventListener("click", () => goToNode(d.id));
}

async function goToNode(nodeId) {
    const input = document.getElementById("start-node");
    input.value = nodeId;
    input.dataset.selectedId = nodeId;
    await updateGraph();
}

function centerGraph() {
    const startNodeId = document.getElementById("start-node").dataset.selectedId;
    const startNode = node.filter(d => d.id === startNodeId).datum();

    if (startNode) {
        const scale = 1;
        const x = width / 2 - startNode.x * scale;
        const y = height / 2 - startNode.y * scale;

        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(x, y).scale(scale)
        );
    }
}

function ticked() {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const scale = (length - 10) / length;
            return d.source.x + dx * scale;
        })
        .attr("y2", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const scale = (length - 10) / length;
            return d.source.y + dy * scale;
        });

    node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    nodeLabels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}


function zoomed(event) {
    g.attr("transform", event.transform);
}

// Initialize the graph
initializeGraph();

// Add event listeners for the buttons
document.getElementById("update-graph-btn").addEventListener("click", updateGraph);
document.getElementById("center-graph-btn").addEventListener("click", centerGraph);

document.getElementById("start-node").addEventListener("change", function () {
    if (this.dataset.selectedId) {
        updateGraph();
    }
});