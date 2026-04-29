# Master plan extracts

The master plan — `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md` — is 60K words. For provenance graph purposes, it's split into ~60 sectioned files here, one per master-plan section.

Each file has:
- Frontmatter: section number, title, last-revised date, version
- Content: the section verbatim
- Lineage: what ADRs derive from this section

This allows the provenance graph to point individual code chunks at specific master-plan sections, not the entire 60K-word document.

## Extraction tool

`tools/master-plan-extractor/` reads the canonical master plan and produces this directory. Run on Day 2 of the evidence sprint and re-run whenever the master plan is revised.

## Why this is here

Solo founder forgets. Code at 200K LoC needs to trace back to its seed. The seed lives in 60 small files, queryable by the provenance graph.
