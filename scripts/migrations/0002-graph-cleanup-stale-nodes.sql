-- 0002-graph-cleanup-stale-nodes.sql
--
-- Idempotent cleanup of stale node rows in axhy_graph that pre-date the
-- resolveOrCreateNode() fix (commit f6f463a). Safe to run on fresh DBs
-- (DELETEs match no rows). Cascade FK on edges removes orphan edge rows.
--
-- Three patterns:
--  1. NULL source_path entity nodes — created by Phase 3 edge extractors
--     before resolveOrCreateNode prevented them from being inserted.
--     Each prisma.user.X() call site emitted a NEW (kind=entity,name=User,
--     source_path=NULL) row; the canonical row from schema.prisma stays.
--  2. __unresolvable__ sentinel nodes — created by Phase 4's failed-href
--     fallback in extractNavigatesTo. Never user-meaningful.
--  3. Stale apps/.../page.tsx ui_screen rows — Phase 1's path-based
--     creation. Phase 2 added clean route-named ones; the old stayed.
--
-- Verified 2026-05-08: applied to switchback.proxy.rlwy.net:20958/railway,
-- removed 90+10+9 = 109 nodes, cascade removed ~203 edges. No domain data.
--
-- @derives(SPEC.md §5.4)
-- @derives(panel-2026-05-08 — Tier 2-B cleanup, founder-acked)

DELETE FROM axhy_graph.nodes WHERE source_path IS NULL AND kind = 'entity';
DELETE FROM axhy_graph.nodes WHERE source_path IS NULL AND kind = 'field';
DELETE FROM axhy_graph.nodes WHERE name = '__unresolvable__';
DELETE FROM axhy_graph.nodes WHERE kind = 'ui_screen' AND name LIKE 'apps/%';
