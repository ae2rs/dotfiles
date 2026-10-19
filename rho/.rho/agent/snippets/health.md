---
description: whole-codebase health pass
---

Do a health, code-quality and sanity pass over the whole codebase. A lot
shipped fast and in parallel worktrees, so look for pieces that don't fit
together, duplicated or diverging versions of one concept, dead code, designs
that hardened under speed, and tests that are slow, flaky or prove nothing.
Report findings ranked by impact, each with its location and a proposed fix.
Change nothing yet.
