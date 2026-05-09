-- 0001-graph-edge-kinds.sql
-- Adds the 4 new edge kinds for the Connectedness Map (panel-locked Q2).
-- Idempotent: safe to re-run.
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'mounts';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'triggers';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'mirrors';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'navigates_to';
