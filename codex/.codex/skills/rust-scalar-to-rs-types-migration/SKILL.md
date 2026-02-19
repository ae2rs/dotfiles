---
name: rust-scalar-to-rs-types-migration
description: Post-extraction migration playbook for scalar types already moved into `rs/types/<module>`. Use when the type definitions have already been removed from `rs/platform/library/scalar`, the destination `rs/types/<module>` crate already exists, and both `//rs/types/<module>` and `//rs/platform/library/scalar` build; then migrate all remaining Rust/proto/Bazel callsites, clean unused imports/deps, handle AppClip and web edge cases, format, and split work into clear commits.
---

# Scalar -> `rs/types/<module>` Post-Extraction Migration

Execute this runbook only after the extraction is complete.

## Hard constraints

- Use Bazel, never Cargo.
- Maximize automated edits (codemods), minimize manual edits.
- In callsite migration phase, do not remove deps except invalid/removed ones.
- Remove unused deps/imports only from `unused_imports` tools output.
- Split large phases into separate commits with concise messages.

## Inputs

Set these variables before starting:

- `NEW_MODULE` (example: `timezone`)
- `TYPE_NAMES` (example: `Timezone TimezoneOffset`)
- `TYPE_RE` regex for ripgrep/perl (example: `Timezone|TimezoneOffset`)
- `NEW_RS_TARGET` (example: `//rs/types/timezone`)
- `NEW_PROTO_TARGET` (example: `//rs/types/timezone:timezone_proto`)
- `NEW_RUST_CRATE` (example: `types_timezone`)
- `NEW_PROTO_IMPORT` (example: `types/timezone/definitions.proto`)
- `NEW_PROTO_PACKAGE` (example: `types.timezone`)
- `OLD_PROTO_IMPORT` (example: `platform/library/scalar/proto/timezone.proto`)
- `OLD_PROTO_TARGET` (example: `//rs/platform/library/scalar/proto:timezone_proto`)
- `OLD_PROTO_PACKAGE` (example: `platform.scalar`)
- `OLD_SCALAR_FILES` optional space-separated paths that must no longer exist (example: `rs/platform/library/scalar/src/timezone.rs rs/platform/library/scalar/proto/timezone.proto`)

## Step 0: Precheck extraction state (must pass before continuing)

### 0.1 Verify moved types are no longer exported from scalar

Run:

```bash
rg -n "\b(${TYPE_RE})\b" rs/platform/library/scalar/src/lib.rs
```

Expected: no matches.

### 0.1b Verify old scalar files are removed

If `OLD_SCALAR_FILES` is set, run:

```bash
for f in ${OLD_SCALAR_FILES}; do
  if [ -e "$f" ]; then
    echo "still exists: $f"
    exit 1
  fi
done
```

Expected: no `still exists` output.

### 0.2 Verify destination crate exists and exports migrated types

Run:

```bash
ls -la rs/types/${NEW_MODULE}
rg -n "pub use .*(${TYPE_RE})" rs/types/${NEW_MODULE}/src/lib.rs
```

Expected: crate exists and exported types are present.

### 0.3 Verify scalar and destination build independently

Run:

```bash
bazel build ${NEW_RS_TARGET} //rs/platform/library/scalar
```

Expected: success.

If any precheck fails, stop and fix extraction first.

## Step 1: Discover deterministic migration surface

Generate deterministic lists in `/tmp`:

```bash
rg -lUP "use\s+scalar::\{[^}]*\b(${TYPE_RE})\b[^}]*\}" rs -g '*.rs' | sort > /tmp/mig_rs_block.txt || true
rg -l "\bscalar::(${TYPE_RE})\b" rs -g '*.rs' | sort > /tmp/mig_rs_fq.txt || true
cat /tmp/mig_rs_block.txt /tmp/mig_rs_fq.txt | sed '/^$/d' | sort -u > /tmp/mig_rs_files.txt

rg -l "import \"${OLD_PROTO_IMPORT}\";" rs -g '*.proto' | sort > /tmp/mig_proto_import.txt || true
rg -l "${OLD_PROTO_PACKAGE//./\\.}\.(${TYPE_RE})" rs -g '*.proto' | sort > /tmp/mig_proto_types.txt || true
cat /tmp/mig_proto_import.txt /tmp/mig_proto_types.txt | sed '/^$/d' | sort -u > /tmp/mig_proto_files.txt

rg -l "\"${OLD_PROTO_TARGET}\"" rs -g 'BUILD.bazel' | sort > /tmp/mig_proto_build_files.txt || true

: > /tmp/mig_rs_build_files.txt
while IFS= read -r f; do
  d=$(dirname "$f")
  while [ "$d" != "." ] && [ "$d" != "/" ]; do
    if [ -f "$d/BUILD.bazel" ]; then
      echo "$d/BUILD.bazel" >> /tmp/mig_rs_build_files.txt
      break
    fi
    d=$(dirname "$d")
  done
done < /tmp/mig_rs_files.txt
sort -u -o /tmp/mig_rs_build_files.txt /tmp/mig_rs_build_files.txt
```

## Step 2: Apply bulk codemods

### 2.1 Update proto source files

```bash
while IFS= read -r f; do
  perl -0pi -e '
    s#import "'"${OLD_PROTO_IMPORT//\//\/}"'";#import "'"${NEW_PROTO_IMPORT//\//\/}"'";#g;
    s/'"${OLD_PROTO_PACKAGE//./\\.}"'\.TimezoneOffset/'"${NEW_PROTO_PACKAGE//./\\.}"'.TimezoneOffset/g;
    s/'"${OLD_PROTO_PACKAGE//./\\.}"'\.Timezone\b/'"${NEW_PROTO_PACKAGE//./\\.}"'.Timezone/g;
  ' "$f"
done < /tmp/mig_proto_files.txt
```

Generalize `Timezone/TimezoneOffset` substitutions to all migrated types.

### 2.2 Update proto Bazel deps

```bash
while IFS= read -r f; do
  perl -0pi -e 's#"'"${OLD_PROTO_TARGET//\//\/}"'"#"'"${NEW_PROTO_TARGET//\//\/}"'"#g' "$f"
done < /tmp/mig_proto_build_files.txt
```

### 2.3 Update Rust callsites

Apply scripted codemods, not ad-hoc manual edits:

1. Replace fully-qualified paths:
- `scalar::Type` -> `${NEW_RUST_CRATE}::Type`

2. Rewrite grouped imports:
- remove migrated types from `use scalar::{...}` blocks
- add `use ${NEW_RUST_CRATE}::Type;` for removed symbols
- drop now-empty `use scalar::{...}` statements

3. Rewrite single imports:
- `use scalar::Type;` -> `use ${NEW_RUST_CRATE}::Type;`

After codemod, verify no escaped newline artifacts were introduced:

```bash
rg -n "\\\\n" rs -g '*.rs'
```

If matches are codemod artifacts inside `use` blocks, normalize them immediately.

### 2.4 Add Rust Bazel deps (phase 1 style)

Insert `//rs/types/<module>` after `//rs/platform/library/scalar` in impacted Rust BUILD files, without deleting other deps:

```bash
while IFS= read -r f; do
  perl -0pi -e '
    s{^(\s*)"//rs/platform/library/scalar",\n(?!\1"//rs/types/'"${NEW_MODULE}"'",\n)}{$1"//rs/platform/library/scalar",\n$1"//rs/types/'"${NEW_MODULE}"'",\n}gm
  ' "$f"
done < /tmp/mig_rs_build_files.txt
```

## Step 3: Iterate with full Rust/proto build checks

Run repeatedly:

```bash
./tools/clippy.py
```

Fix in this order:

1. Missing proto BUILD deps
2. Missing Rust BUILD deps
3. Bad import rewrites/path rewrites
4. Lint fallout from touched code

## Step 4: Handle known edge cases

### 4.1 AppClip edge case

Inspect and fix `iosapp/AppClips/Location/BUILD.bazel` when migration touches shared proto/type deps.

- Check for stale scalar proto deps and replace with `//rs/types/<module>:<module>_proto`.
- Check for stale scalar Rust deps and add/remove `//rs/types/<module>` only when required.

Reference migration example: commit `c527bbcc`.

### 4.2 Web edge case

Inspect web code for old proto/type import paths and migrated symbols.

Reference migration example: commit `0ffd191`.

If any file under `web/` changes, run:

```bash
pnpm -r --filter='!sugar' lint --fix
```

## Step 5: Remove only proven-unused deps/imports

Run both cleanup tools:

```bash
./tools/unused_imports.py
./tools/proto_unused_imports.py
```

Apply only reported removals.

Typical shape:
- For each reported target, remove exactly listed unused Bazel deps.
- Keep all non-reported deps unchanged.

Re-run both tools until clean.

## Step 6: Final checks and formatting

### 6.1 Full codebase check

Run:

```bash
./tools/clippy.py
```

### 6.2 Formatting passes

Run:

```bash
./tools/rustfmt $(git ls-files | grep -E "\.rs$")
find . -regex ".*\.proto" | xargs clang-format --style Google --assume-filename .proto -i
buildifier -r ./rs
```

### 6.3 Re-run compile check after formatting

Run:

```bash
./tools/clippy.py
```

## Step 7: Commit strategy (required)

Use separate commits for large phases. Keep commit messages concise and descriptive.

Recommended split:

1. `migrate <module> type callsites and bazel deps`
- Rust/proto/BUILD callsite migration only

2. `remove unused deps after <module> migration`
- only `unused_imports` and `proto_unused_imports` removals

3. `fix appclip and web fallout for <module> migration`
- AppClip BUILD and web import/lint follow-ups

4. `format rs/proto/bazel after <module> migration`
- rustfmt + clang-format + buildifier only

## Final invariants (must be zero)

Run:

```bash
# old Rust type refs
rg -nUP 'use\s+scalar::\{[^}]*\b(TypeA|TypeB)\b[^}]*\}|\bscalar::(TypeA|TypeB)\b' rs -g '*.rs'

# old proto package refs
rg -n 'platform\.scalar\.(TypeA|TypeB)' rs -g '*.proto'

# old proto import path
rg -n 'import "platform/library/scalar/proto/timezone.proto";' rs -g '*.proto'

# old proto Bazel target
rg -n '"//rs/platform/library/scalar/proto:timezone_proto"' rs -g 'BUILD.bazel'
```

Replace `TypeA|TypeB` and timezone-specific strings for the concrete migration.
