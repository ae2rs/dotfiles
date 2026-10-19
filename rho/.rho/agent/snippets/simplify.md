---
description: simplify recent changes without altering behaviour
---

Simplify the code changed in the working copy, or what I name below, preserving behaviour exactly.

Look for: duplicated logic that an existing helper already covers, indirection that earns nothing, names that fight the surrounding code, and comments restating what the code says.

Match the conventions already in the file — comment density, naming, idiom. Do not reformat untouched code, and do not introduce abstractions for a single caller.

Show the diff and state what behaviour you verified is unchanged.
