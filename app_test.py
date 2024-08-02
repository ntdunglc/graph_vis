import pytest
from flask import json
from app import create_app
from graph_db import InMemoryGraphDatabase


@pytest.fixture
def graph_db():
    db = InMemoryGraphDatabase()
    # Add test data
    nodes = [
        {"id": "1", "type": "data", "description": "This is data 1"},
        {"id": "2", "type": "rule", "description": "This is rule 2"},
        {"id": "3", "type": "data", "description": "This is data 3"},
    ]
    links = [
        {"source": "1", "target": "2", "type": "output"},
        {"source": "2", "target": "3", "type": "input"},
    ]
    for node in nodes:
        db.add_node(node)
    for link in links:
        db.add_link(link)
    return db


@pytest.fixture
def client(graph_db):
    app = create_app(graph_db)
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_init_graph(client, graph_db):
    response = client.get("/api/init")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["nodeCount"] == graph_db.get_node_count()
    assert data["linkCount"] == graph_db.get_link_count()


def test_get_node_ids(client, graph_db):
    response = client.get("/api/node_ids")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert set(data) == set(graph_db.get_node_ids())


def test_get_subgraph(client):
    response = client.get(
        "/api/subgraph?startNodeId=1&forwardDepth=2&backwardDepth=2&edgeLimit=4"
    )
    assert response.status_code == 200
    data = json.loads(response.data)

    expected_response = {
        "links": [
            {"source": "1", "target": "2", "type": "output"},
            {"source": "2", "target": "3", "type": "input"},
        ],
        "nodes": [
            {"description": "This is data 1", "id": "1", "type": "data"},
            {"description": "This is rule 2", "id": "2", "type": "rule"},
            {"description": "This is data 3", "id": "3", "type": "data"},
        ],
    }

    # Assert that the response has the correct keys
    assert set(data.keys()) == set(expected_response.keys())

    # Sort the lists of dictionaries by a specific key
    sort_key = lambda x: x["id"] if "id" in x else x["source"]

    # Assert links
    assert sorted(data["links"], key=sort_key) == sorted(
        expected_response["links"], key=sort_key
    )

    # Assert nodes
    assert sorted(data["nodes"], key=sort_key) == sorted(
        expected_response["nodes"], key=sort_key
    )


def test_invalid_subgraph_params(client):
    invalid_params = [
        ("4", "2", "2", "4"),  # Invalid start node
        ("1", "-1", "2", "4"),  # Negative depth
        ("1", "2", "2", "0"),  # Zero edge limit
        ("1", "a", "2", "4"),  # Non-integer depth
    ]
    for start_id, forward, backward, edge_limit in invalid_params:
        response = client.get(
            f"/api/subgraph?startNodeId={start_id}&forwardDepth={forward}&backwardDepth={backward}&edgeLimit={edge_limit}"
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert "error" in data


if __name__ == "__main__":
    pytest.main()
