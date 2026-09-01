---
description: Review changes for correctness and simplification
argument-hint: "[staged|branch|<path>]"
---
Review ${1:-the staged changes (`git diff --cached`)}.

Report only findings you can defend with a concrete failure scenario — specific inputs
or state that produce a wrong result. For each: the file and line, one sentence on the
defect, and the scenario that triggers it.

Cover, in priority order:
1. Correctness bugs — logic errors, unhandled cases, broken invariants
2. Reuse — existing helpers in this repo that the change reimplements
3. Simplification — the same behaviour with less code
4. Efficiency — only where the cost is real, not theoretical

Say so plainly if you find nothing worth reporting. Do not pad the list.
