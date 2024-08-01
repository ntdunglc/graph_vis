let svg, g, simulation, link, node, nodeLabels, width, height, zoom;

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

    // Define arrowhead marker
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

    const initResponse = await fetch('/api/init');
    const initData = await initResponse.json();
    console.log(`Total nodes: ${initData.nodeCount}, Total links: ${initData.linkCount}`);

    await populateNodeDropdown();
    updateGraph();

    // Wait for the simulation to settle before centering
    simulation.on("end", () => {
        centerGraph();
        // Display start node information after centering
        const startNodeId = document.getElementById("start-node").value;
        showNodeInfo(null, { id: startNodeId, type: "Unknown", label: `Node ${startNodeId}`, description: "Loading..." });
    });
}

async function populateNodeDropdown() {
    const response = await fetch('/api/node_ids');
    const nodeIds = await response.json();
    const dropdown = document.getElementById("start-node");
    nodeIds.forEach(id => {
        const option = document.createElement("option");
        option.value = id;
        option.text = `Node ${id}`;
        dropdown.appendChild(option);
    });
}

async function updateGraph() {
    const startNodeId = document.getElementById("start-node").value;
    const forwardDepth = parseInt(document.getElementById("forward-depth").value);
    const backwardDepth = parseInt(document.getElementById("backward-depth").value);
    const edgeLimit = parseInt(document.getElementById("edge-limit").value);

    const response = await fetch(`/api/subgraph?startNodeId=${startNodeId}&forwardDepth=${forwardDepth}&backwardDepth=${backwardDepth}&edgeLimit=${edgeLimit}`);
    const subgraph = await response.json();

    g.selectAll("*").remove();

    link = g.append("g")
        .selectAll("line")
        .data(subgraph.links)
        .enter().append("line")
        .attr("class", "link")
        .attr("stroke", d => d.type === "output" ? "#1f77b4" : d.type === "input" ? "#2ca02c" : "#d62728")
        .attr("marker-end", "url(#arrowhead)");

    node = g.append("g")
        .selectAll("circle")
        .data(subgraph.nodes)
        .enter().append("circle")
        .attr("class", d => d.id === startNodeId ? "node start-node" : "node")
        .attr("r", d => d.id === startNodeId ? 8 : 5)
        .attr("fill", d => d.type === "rule" ? "#ff7f0e" : "#1f77b4")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => { event.stopPropagation(); showNodeInfo(event, d); })
        .on("dblclick", (event, d) => { event.stopPropagation(); goToNode(d.id); });

    nodeLabels = g.append("g")
        .selectAll("text")
        .data(subgraph.nodes)
        .enter().append("text")
        .attr("class", "node-label")
        .attr("dx", d => d.id === startNodeId ? 12 : 8)
        .attr("dy", ".35em")
        .text(d => d.label)
        .style("cursor", "pointer")
        .on("click", (event, d) => { event.stopPropagation(); showNodeInfo(event, d); })
        .on("dblclick", (event, d) => { event.stopPropagation(); goToNode(d.id); });

    simulation.nodes(subgraph.nodes).on("tick", ticked);

    simulation.force("link").links(subgraph.links);

    simulation.alpha(1).restart();

    // Center the graph and show start node info after a short delay
    setTimeout(() => {
        centerGraph();
        showNodeInfo(null, subgraph.nodes.find(n => n.id === startNodeId));
    }, 100);
}

function zoomed(event) {
    g.attr("transform", event.transform);
}

function showNodeInfo(event, d) {
    const nodeInfo = document.getElementById("node-info");
    nodeInfo.innerHTML = `
        <h3>Node Information</h3>
        <p><strong>ID:</strong> ${d.id}</p>
        <p><strong>Type:</strong> ${d.type}</p>
        <p><strong>Label:</strong> ${d.label}</p>
        <p><strong>Description:</strong> ${d.description}</p>
        <button id="go-to-node-btn">Go To #${d.id}</button>
    `;

    // Add event listener to the new Go button
    document.getElementById("go-to-node-btn").addEventListener("click", () => goToNode(d.id));
}

function goToNode(nodeId) {
    document.getElementById("start-node").value = nodeId;
    updateGraph();
}

function getSubgraph(startNodeId, forwardDepth, backwardDepth, edgeLimit) {
    const subgraph = { nodes: new Map(), links: new Set() };
    const visitedForward = new Set();
    const visitedBackward = new Set();

    function addNode(id) {
        if (!subgraph.nodes.has(id)) {
            const node = graphData.nodes.find(n => n.id === id);
            if (node) subgraph.nodes.set(id, { ...node });
        }
    }

    function traverseForward(nodeId, depth) {
        if (depth >= forwardDepth || visitedForward.has(nodeId)) return;
        visitedForward.add(nodeId);
        addNode(nodeId);

        const outgoingLinks = graphData.links
            .filter(l => l.source === nodeId)
            .slice(0, edgeLimit);

        for (const link of outgoingLinks) {
            subgraph.links.add({ ...link });
            addNode(link.target);
            traverseForward(link.target, depth + 1);
        }
    }

    function traverseBackward(nodeId, depth) {
        if (depth >= backwardDepth || visitedBackward.has(nodeId)) return;
        visitedBackward.add(nodeId);
        addNode(nodeId);

        const incomingLinks = graphData.links
            .filter(l => l.target === nodeId)
            .slice(0, edgeLimit);

        for (const link of incomingLinks) {
            subgraph.links.add({ ...link });
            addNode(link.source);
            traverseBackward(link.source, depth + 1);
        }
    }

    addNode(startNodeId);
    traverseForward(startNodeId, 0);
    traverseBackward(startNodeId, 0);

    return {
        nodes: Array.from(subgraph.nodes.values()),
        links: Array.from(subgraph.links)
    };
}

function ticked() {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const scale = (length - 10) / length; // Adjust 10 to change arrow position
            return d.source.x + dx * scale;
        })
        .attr("y2", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const scale = (length - 10) / length; // Adjust 10 to change arrow position
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

function centerGraph() {
    const startNodeId = document.getElementById("start-node").value;
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

// Initialize the graph
initializeGraph();

// Add event listeners for the buttons
document.getElementById("update-graph-btn").addEventListener("click", updateGraph);
document.getElementById("center-graph-btn").addEventListener("click", centerGraph);

