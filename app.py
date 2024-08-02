from flask import Flask, jsonify, request, send_from_directory
import os
from graph_db import create_fake_sqlite_data, create_fake_data, extract_subgraph


def create_app(graph_db=None):
    app = Flask(__name__, static_folder="static", static_url_path="")

    if graph_db is None:
        # graph_db = create_fake_data()
        graph_db = create_fake_sqlite_data("testgraph.db")

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
            {
                "nodeCount": graph_db.get_node_count(),
                "linkCount": graph_db.get_link_count(),
            }
        )

    @app.route("/api/node_ids")
    def get_node_ids():
        search_term = request.args.get("term", "")
        matching_nodes = graph_db.search_nodes(search_term)
        return jsonify([node["id"] for node in matching_nodes])

    @app.route("/api/subgraph")
    def get_subgraph():
        try:
            start_node_id = request.args.get("startNodeId")
            forward_depth = int(request.args.get("forwardDepth"))
            backward_depth = int(request.args.get("backwardDepth"))
            edge_limit = int(request.args.get("edgeLimit"))

            if start_node_id not in graph_db.get_node_ids():
                return jsonify({"error": "Invalid start node ID"}), 400

            if forward_depth < 0 or backward_depth < 0:
                return jsonify({"error": "Depth cannot be negative"}), 400

            if edge_limit <= 0:
                return jsonify({"error": "Edge limit must be positive"}), 400

            subgraph = extract_subgraph(
                graph_db, start_node_id, forward_depth, backward_depth, edge_limit
            )
            return jsonify(subgraph)
        except ValueError:
            return jsonify({"error": "Invalid parameter types"}), 400

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000)
