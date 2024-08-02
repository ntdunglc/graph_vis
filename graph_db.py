import random
import sqlite3
from typing import List, Dict


class InMemoryGraphDatabase:
    def __init__(self):
        self._nodes = []
        self._links = []

    def add_node(self, node):
        self._nodes.append(node)

    def add_link(self, link):
        self._links.append(link)

    def get_node_ids(self):
        return [node["id"] for node in self._nodes]

    def get_nodes(self):
        return self._nodes

    def get_links(self):
        return self._links

    def get_node_count(self):
        return len(self._nodes)

    def get_link_count(self):
        return len(self._links)

    def get_node_by_id(self, node_id):
        return next((n for n in self._nodes if n["id"] == node_id), None)

    def get_outgoing_links(self, node_id):
        return [l for l in self._links if l["source"] == node_id]

    def get_incoming_links(self, node_id):
        return [l for l in self._links if l["target"] == node_id]

    def search_nodes(self, term, limit=30):
        """Search nodes by ID, case-insensitive."""
        term = term.lower()
        return [node for node in self._nodes if term in node["id"].lower()][:limit]


def create_fake_data():
    graph_db = InMemoryGraphDatabase()

    # Generate 1000 nodes
    for i in range(1, 1001):
        node_type = "rule" if random.random() < 0.5 else "data"
        graph_db.add_node(
            {
                "id": str(i),
                "type": node_type,
                "description": f"This is {node_type} {i}. It contains some sample information about the node.",
            }
        )

    # Generate random links (avg 5 links per node)
    for i in range(1, 1001):
        num_links = random.randint(1, 10)
        for _ in range(num_links):
            target_id = random.randint(1, 1000)
            if target_id != i:
                link_type = random.choice(["output", "input", "contains"])
                graph_db.add_link(
                    {"source": str(i), "target": str(target_id), "type": link_type}
                )

    return graph_db


class SqliteGraphDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._create_tables()

    def _create_tables(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    type TEXT,
                    description TEXT
                )
            """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT,
                    target TEXT,
                    type TEXT,
                    FOREIGN KEY (source) REFERENCES nodes (id),
                    FOREIGN KEY (target) REFERENCES nodes (id)
                )
            """
            )
            conn.commit()

    def truncate(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM nodes")
            cursor.execute("DELETE FROM links")
            conn.commit()

    def add_node(self, node: Dict):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO nodes (id, type, description)
                VALUES (?, ?, ?)
            """,
                (node["id"], node["type"], node["description"]),
            )
            conn.commit()

    def add_link(self, link: Dict):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO links (source, target, type)
                VALUES (?, ?, ?)
            """,
                (link["source"], link["target"], link["type"]),
            )
            conn.commit()

    def get_node_ids(self) -> List[str]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM nodes")
            return [row[0] for row in cursor.fetchall()]

    def get_nodes(self) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM nodes")
            return [
                {"id": row[0], "type": row[1], "description": row[2]}
                for row in cursor.fetchall()
            ]

    def get_links(self) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT source, target, type FROM links")
            return [
                {"source": row[0], "target": row[1], "type": row[2]}
                for row in cursor.fetchall()
            ]

    def get_node_count(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM nodes")
            return cursor.fetchone()[0]

    def get_link_count(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM links")
            return cursor.fetchone()[0]

    def get_node_by_id(self, node_id: str) -> Dict:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
            row = cursor.fetchone()
            return (
                {"id": row[0], "type": row[1], "description": row[2]} if row else None
            )

    def get_outgoing_links(self, node_id: str) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT source, target, type FROM links WHERE source = ?", (node_id,)
            )
            return [
                {"source": row[0], "target": row[1], "type": row[2]}
                for row in cursor.fetchall()
            ]

    def get_incoming_links(self, node_id: str) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT source, target, type FROM links WHERE target = ?", (node_id,)
            )
            return [
                {"source": row[0], "target": row[1], "type": row[2]}
                for row in cursor.fetchall()
            ]

    def search_nodes(self, term: str, limit: int = 30) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM nodes 
                WHERE LOWER(id) LIKE LOWER(?) 
                LIMIT ?
            """,
                (f"%{term}%", limit),
            )
            return [
                {"id": row[0], "type": row[1], "description": row[2]}
                for row in cursor.fetchall()
            ]


def create_fake_sqlite_data(db_path: str):
    graph_db = SqliteGraphDatabase(db_path)
    graph_db.truncate()

    # Generate 1000 nodes
    for i in range(1, 1001):
        node_type = "rule" if random.random() < 0.5 else "data"
        graph_db.add_node(
            {
                "id": f"node_{i}",
                "type": node_type,
                "description": f"This is {node_type} {i}. It contains some sample information about the node.",
            }
        )

    # Generate random links (avg 5 links per node)
    for i in range(1, 1001):
        num_links = random.randint(1, 10)
        for _ in range(num_links):
            target_id = random.randint(1, 1000)
            if target_id != i:
                link_type = random.choice(["output", "input", "contains"])
                graph_db.add_link(
                    {
                        "source": f"node_{i}",
                        "target": f"node_{target_id}",
                        "type": link_type,
                    }
                )

    return graph_db


def extract_subgraph(
    graph_db, start_node_id, forward_depth, backward_depth, edge_limit
):
    subgraph = {"nodes": {}, "links": []}
    visited_forward = set()
    visited_backward = set()

    def add_node(node_id):
        if node_id not in subgraph["nodes"]:
            node = graph_db.get_node_by_id(node_id)
            if node:
                subgraph["nodes"][node_id] = node.copy()

    def traverse_forward(node_id, depth):
        if depth >= forward_depth or node_id in visited_forward:
            return
        visited_forward.add(node_id)
        add_node(node_id)

        outgoing_links = graph_db.get_outgoing_links(node_id)[:edge_limit]
        for link in outgoing_links:
            target_id = link["target"]
            add_node(target_id)
            subgraph["links"].append(link.copy())
            traverse_forward(target_id, depth + 1)

    def traverse_backward(node_id, depth):
        if depth >= backward_depth or node_id in visited_backward:
            return
        visited_backward.add(node_id)
        add_node(node_id)

        incoming_links = graph_db.get_incoming_links(node_id)[:edge_limit]
        for link in incoming_links:
            source_id = link["source"]
            add_node(source_id)
            subgraph["links"].append(link.copy())
            traverse_backward(source_id, depth + 1)

    add_node(start_node_id)
    traverse_forward(start_node_id, 0)
    traverse_backward(start_node_id, 0)

    return {"nodes": list(subgraph["nodes"].values()), "links": subgraph["links"]}
