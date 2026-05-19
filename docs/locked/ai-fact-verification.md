# AI Fact Verification Protocol

**Status: LOCKED**
**Locked by: Founder directive, 2026-05-19**
**Scope: All AI sessions in axhy-v3**

## Why this exists

Claude forgets context when conversations grow. It fills gaps with assumptions
that sound confident but aren't grounded in current code. The founder caught
this pattern: Claude says "X is in file Y" without reading the file, and
sometimes X was refactored away 3 sessions ago. Memory entries are stale
pointers. Vector DB results are cached snapshots. Neither is truth.

Truth lives in the filesystem and the database. Everything else is a hint.

---

## Rule 1: Verify before claiming

Never state a fact about code, schema, config, or system state without first
reading the file, running the command, or querying the database in the CURRENT
session.

**Banned phrases in responses:**

- "I remember that..."
- "Based on my memory..."
- "I believe X is..."
- "I think X does..."
- "From our previous session..."
- "I assume..."
- "This should be..." (when describing current state)

**Required instead:**

- "Reading [file:line], I see..."
- "grep shows [result]..."
- "The current code at [path] does..."
- "Running [command], output is..."
- "Checked — [file] exists / does not exist"

## Rule 2: Memory is a hint, not a fact

Memory entries from previous sessions are POINTERS to investigate. They tell
you WHERE to look, not WHAT you'll find. The code may have changed since the
memory was written.

When memory says "function X is in file Y":

1. Read file Y
2. If X is still there — proceed, cite the file
3. If X is gone or changed — update memory, adjust approach
4. NEVER proceed based on the memory alone

## Rule 3: No assumed state

Never assume the current state of:

- Whether a file exists (check with `existsSync` or `ls`)
- Whether a function, variable, or import exists (grep for it)
- Whether a test passes (run it)
- Whether a migration has been applied (check the DB)
- Whether a service is deployed (check the endpoint)
- Whether a dependency is installed (check node_modules or lockfile)

If you haven't verified it THIS session, you don't know it.

## Rule 4: Cite evidence for every factual claim

Every factual claim about the codebase must have a citation:

- Code claims → file:line reference from a Read or grep
- Runtime claims → command output from Bash
- DB claims → query result
- Config claims → file + key from a Read
- "It works" → test output or browser verification

Claims without citations are assumptions. Assumptions cause bugs.

## Rule 5: impactCheck and vectorSearch are hints too

When `impactCheck()` or `vectorSearch()` returns results from the vector DB:

- The chunks may be STALE (source file changed since embedding)
- The chunks may be from a DIFFERENT version of the doc
- Always verify each returned chunk against the current file before acting

The vector DB tells you what WAS true when brain:build last ran.
The filesystem tells you what IS true now.

## Rule 6: When in doubt, read the file

The cost of reading a file is near zero.
The cost of acting on a wrong assumption can be hours of debugging.

When you're "pretty sure" about something — that's exactly when you should
verify. Confidence without evidence is the root of hallucination.

---

## Enforcement

- Self-reasoning protocol Phase 3 requires file reads for verification
- Learning files must cite specific file:line in root cause (not "I think")
- Session audit can detect assumption language in code comments
- Pre-commit hook blocks commits with unverified TODO comments
- This doc is embedded in the vector DB with persona=all — every session sees it

## Skip mechanism

None. There is no skip for fact-verification. If you're stating a fact about
the codebase, you verify it. No exceptions.
