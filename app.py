from flask import Flask, jsonify, request, send_from_directory
import random
import json
import os

app = Flask(__name__, static_folder="static", static_url_path="")

# Generate graph data
graph_data = {"nodes": [], "links": []}

# Generate 3 million nodes
for i in range(1, 3000001):
    node_type = "rule" if random.random() < 0.5 else "data"
    graph_data["nodes"].append(
        {
            "id": str(i),
            "type": node_type,
            "label": f"{node_type.capitalize()} {i}",
            "description": f"This is {node_type} {i}. It contains some sample information about the node.",
        }
    )

# Generate 10 million links
for i in range(1, 10000001):
    num_links = random.randint(1, 5)
    for _ in range(num_links):
        target_id = random.randint(1, 3000000)
        if target_id != i:
            link_type = random.choice(["output", "input", "contains"])
            graph_data["links"].append(
                {"source": str(i), "target": str(target_id), "type": link_type}
            )


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return "File not found", 404


@app.route("/api/init")
def init_graph():
    return jsonify(
        {"nodeCount": len(graph_data["nodes"]), "linkCount": len(graph_data["links"])}
    )


@app.route("/api/node_ids")
def get_node_ids():
    return jsonify([node["id"] for node in graph_data["nodes"]])


@app.route("/api/subgraph")
def get_subgraph():
    start_node_id = request.args.get("startNodeId")
    forward_depth = int(request.args.get("forwardDepth"))
    backward_depth = int(request.args.get("backwardDepth"))
    edge_limit = int(request.args.get("edgeLimit"))

    subgraph = extract_subgraph(
        start_node_id, forward_depth, backward_depth, edge_limit
    )
    return jsonify(subgraph)


def extract_subgraph(start_node_id, forward_depth, backward_depth, edge_limit):
    subgraph = {"nodes": {}, "links": set()}
    visited_forward = set()
    visited_backward = set()

    def add_node(node_id):
        if node_id not in subgraph["nodes"]:
            node = next((n for n in graph_data["nodes"] if n["id"] == node_id), None)
            if node:
                subgraph["nodes"][node_id] = node.copy()

    def traverse_forward(node_id, depth):
        if depth >= forward_depth or node_id in visited_forward:
            return
        visited_forward.add(node_id)
        add_node(node_id)

        outgoing_links = [l for l in graph_data["links"] if l["source"] == node_id][
            :edge_limit
        ]
        for link in outgoing_links:
            subgraph["links"].add(json.dumps(link))
            add_node(link["target"])
            traverse_forward(link["target"], depth + 1)

    def traverse_backward(node_id, depth):
        if depth >= backward_depth or node_id in visited_backward:
            return
        visited_backward.add(node_id)
        add_node(node_id)

        incoming_links = [l for l in graph_data["links"] if l["target"] == node_id][
            :edge_limit
        ]
        for link in incoming_links:
            subgraph["links"].add(json.dumps(link))
            add_node(link["source"])
            traverse_backward(link["source"], depth + 1)

    add_node(start_node_id)
    traverse_forward(start_node_id, 0)
    traverse_backward(start_node_id, 0)

    return {
        "nodes": list(subgraph["nodes"].values()),
        "links": [json.loads(link) for link in subgraph["links"]],
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
