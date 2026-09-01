# Scalar -> `types_<module>` playbook

This is the detailed runbook for moving types out of `rs/platform/library/scalar` into a new `rs/platform/types/<module>` crate.

The current repo layout is **not** `rs/types/<module>`; it is:

- Rust crate directory: `rs/platform/types/<module>`
- Rust crate name: `types_<module>`
- Rust crate Bazel label: `//rs/platform/types/<module>`
- Public proto target label used by other BUILD files: `//rs/platform/types/<module>:<module>_proto`

The strongest reference example is PR #27410 (`types_invite_code`), which used three commits:

- `boilerplate` - commit `02abbae93ed7089fa5c347997cf5636a59f48b70`
- `compile` - commit `62bec8af7c59b2e5200d6151bb4aa4a54a4dee08`
- `migrate` - commit `3ab8fea15ec2725af3f9bfcd784b56526b494be0`

## Hard rules

- Use Bazel only. Never use Cargo.
- Preserve behavior during extraction. Do not refactor unrelated logic while moving code.
- Prefer exactly three commits: `boilerplate`, `compile`, `migrate`.
- `compile` is intentionally narrow: only make `scalar` and the destination crate compile.
- `migrate` is the repo-wide import/dependency update pass.
- Cleanup removals must come from tool output, not guesswork.
- If a shell alias is unavailable, run the expanded commands directly.

## Inputs

Set these variables before starting.

- `MODULE` - destination module name, e.g. `invite_code`
- `TYPE_NAMES` - migrated Rust/proto type names, e.g. `InviteCode InviteCodeLegacy`
- `TYPE_RE` - regex alternation for ripgrep/perl, e.g. `InviteCode|InviteCodeLegacy`
- `NEW_DIR` - `rs/platform/types/${MODULE}`
- `NEW_RS_TARGET` - `//rs/platform/types/${MODULE}`
- `NEW_RUST_CRATE` - `types_${MODULE}`
- `NEW_LOCAL_PROST_DEP` - `:${MODULE}_prost` for the destination crate's own BUILD file
- `NEW_EXPORT_PROST_TARGET` - `//rs/platform/types/${MODULE}:${MODULE}_proto` for other BUILD files
- `NEW_PROTO_IMPORT` - `platform/types/${MODULE}/definitions.proto`
- `NEW_PROTO_PACKAGE` - `platform.types.${MODULE}`
- `OLD_SCALAR_RS_FILES` - space-separated scalar source files being moved, e.g. `rs/platform/library/scalar/src/invite_code.rs rs/platform/library/scalar/src/invite_code_legacy.rs`
- `OLD_SCALAR_PROTO_FILE` - old scalar proto file, e.g. `rs/platform/library/scalar/proto/invite_code.proto`
- `OLD_LOCAL_PROST_DEP` - old dep in `rs/platform/library/scalar/BUILD.bazel`, e.g. `//rs/platform/library/scalar/proto:${MODULE}_prost`
- `OLD_EXPORT_PROST_TARGET` - old dep used in other BUILD files, e.g. `//rs/platform/library/scalar/proto:${MODULE}_proto`
- `OLD_PROTO_IMPORT` - old import path, e.g. `platform/library/scalar/proto/${MODULE}.proto`
- `OLD_PROTO_PACKAGE` - usually `platform.scalar`

## Step 0: Inspect the existing shape

Read these first:

- `rs/platform/library/scalar/BUILD.bazel`
- `rs/platform/library/scalar/src/lib.rs`
- `rs/platform/library/scalar/proto/BUILD.bazel`
- the scalar Rust files being moved
- the scalar proto file being moved
- `rs/platform/types/invite_code/BUILD.bazel`
- `rs/platform/types/invite_code/src/lib.rs`
- `rs/platform/types/invite_code/src/invite_code.rs`
- `rs/platform/types/invite_code/definitions.proto`

Also inspect a sibling destination crate that is structurally close to the one you are creating.

## Step 1: `boilerplate`

Goal: create the new crate skeleton without touching `scalar` yet.

### 1.1 Create the destination directory and placeholder files

Create:

- `rs/platform/types/${MODULE}/BUILD.bazel`
- `rs/platform/types/${MODULE}/definitions.proto`
- `rs/platform/types/${MODULE}/src/lib.rs`
- placeholder `src/*.rs` files matching the scalar files you plan to move

### 1.2 Minimal file shape

Start with a minimal BUILD file and add real deps later during `compile`.

Example shape:

```python
load("//bazel/rules/rust:prost.bzl", "rust_prost_library")
load("//bazel/rules/rust:rust.bzl", "rust_library")

package(default_visibility = ["//visibility:public"])

rust_prost_library(
    name = "${MODULE}_prost",
    srcs = ["definitions.proto"],
    crate_name = "${MODULE}_proto",
)

rust_library(
    name = "${MODULE}",
    srcs = glob(["src/**/*.rs"]),
    crate_name = "types_${MODULE}",
    deps = [
        ":${MODULE}_prost",
        "//rs/platform/library/proto",
    ],
)
```

Minimal `definitions.proto`:

```proto
syntax = "proto3";

package platform.types.${MODULE};
```

Minimal `src/lib.rs` shape:

```rust
mod file_a;
mod file_b;
```

At this stage, placeholder Rust files can be empty.

### 1.3 Validate and commit

If the placeholder crate builds, do a quick build:

```bash
bazel build ${NEW_RS_TARGET}
```

Commit message:

```text
boilerplate
```

## Step 2: `compile`

Goal: move the actual Rust/proto implementation into the new crate and make only the destination crate plus `scalar` compile.

Do **not** migrate the rest of the repo yet.

### 2.1 Copy the Rust implementation from scalar into the new crate

For each file in `OLD_SCALAR_RS_FILES`:

- copy the implementation into the matching file in `rs/platform/types/${MODULE}/src/`
- preserve behavior; this is not the time for cleanup/refactors
- update proto module paths from `platform::scalar` to `platform::types::<module>`
- update any crate imports that now come from the new crate layout
- update `rs/platform/types/${MODULE}/src/lib.rs` so it `pub use`s the moved types from their new modules

Example pattern after the move:

```rust
use invite_code_proto::platform::types::invite_code as proto;
```

not:

```rust
use invite_code_proto::platform::scalar as proto;
```

### 2.2 Copy the proto definition into `definitions.proto`

Move the old scalar proto content into:

- `rs/platform/types/${MODULE}/definitions.proto`

Then update:

- package from `platform.scalar` to `platform.types.${MODULE}`
- imports to current repo layout if needed

### 2.3 Expand the destination BUILD file to match the moved code

Now add the real deps, selects, and `crates(...)` entries required by the copied code.

Typical additions include:

- `//rs/platform/library/error`
- `//rs/platform/library/proto`
- server-only deps like `//rs/engine/library/scylla_utils`
- `crates([...])` entries for things like `base64`, `chrono`, `icu`, `strum`, `scylla`, `sqlx`, etc.

Follow neighboring types crates for exact style.

### 2.4 Remove the moved pieces from scalar

Update `rs/platform/library/scalar/src/lib.rs`:

- remove `mod ...;` lines for the moved files
- remove `pub use ...;` lines for the moved types
- remove moved proto re-exports if present

Update `rs/platform/library/scalar/proto/BUILD.bazel`:

- remove the `rust_prost_library` block for the moved proto

Update `rs/platform/library/scalar/BUILD.bazel`:

- remove `OLD_LOCAL_PROST_DEP`

Delete the old source and proto files once the new crate contains the real implementation.

### 2.5 Compile only the narrow surface

Run:

```bash
bazel build ${NEW_RS_TARGET} //rs/platform/library/scalar
```

Expected result:

- the new types crate builds
- `scalar` still builds
- many other repo targets may still fail because imports have not been migrated yet

That is correct for this phase.

### 2.6 Commit

Commit message:

```text
compile
```

## Step 3: `migrate`

Goal: update the rest of the repo to use the new crate/proto targets.

### 3.1 Generate deterministic migration file lists

```bash
rg -lUP "use\s+scalar::\{[^}]*\b(${TYPE_RE})\b[^}]*\}" rs -g '*.rs' | sort > /tmp/mig_rs_block.txt || true
rg -l "\bscalar::(${TYPE_RE})\b" rs -g '*.rs' | sort > /tmp/mig_rs_fq.txt || true
rg -l "^use scalar::(${TYPE_RE});$" rs -g '*.rs' | sort > /tmp/mig_rs_single.txt || true
cat /tmp/mig_rs_block.txt /tmp/mig_rs_fq.txt /tmp/mig_rs_single.txt | sed '/^$/d' | sort -u > /tmp/mig_rs_files.txt

rg -l "import \"${OLD_PROTO_IMPORT}\";" . -g '*.proto' | sort > /tmp/mig_proto_import.txt || true
rg -l "${OLD_PROTO_PACKAGE//./\\.}\.(${TYPE_RE})" . -g '*.proto' | sort > /tmp/mig_proto_types.txt || true
cat /tmp/mig_proto_import.txt /tmp/mig_proto_types.txt | sed '/^$/d' | sort -u > /tmp/mig_proto_files.txt

rg -l "\"${OLD_EXPORT_PROST_TARGET}\"" . -g 'BUILD.bazel' | sort > /tmp/mig_proto_build_files.txt || true

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

### 3.2 Update Rust callsites

Apply the migration mechanically where possible.

#### Fully-qualified paths

Replace:

- `scalar::Type` -> `${NEW_RUST_CRATE}::Type`

for all migrated types.

#### Single imports

Replace:

- `use scalar::Type;` -> `use ${NEW_RUST_CRATE}::Type;`

#### Grouped imports

Rewrite grouped imports carefully.

Examples:

```rust
use scalar::{ATime, InviteCode};
```

becomes:

```rust
use scalar::ATime;
use types_invite_code::InviteCode;
```

and:

```rust
use scalar::{InviteCode, InviteCodeLegacy, InviteOrigin};
```

becomes:

```rust
use scalar::InviteOrigin;
use types_invite_code::{InviteCode, InviteCodeLegacy};
```

Rules:

- keep `scalar` imports for non-migrated symbols
- move only migrated symbols to `types_<module>`
- drop now-empty `use scalar::{...}` statements
- keep edits mechanical and consistent

### 3.3 Update proto files

For every file in `/tmp/mig_proto_files.txt`:

- replace `import "${OLD_PROTO_IMPORT}";` with `import "${NEW_PROTO_IMPORT}";`
- replace `platform.scalar.Type` with `platform.types.${MODULE}.Type` for migrated types only

Example shell shape:

```bash
while IFS= read -r f; do
  perl -0pi -e 's#import "'"${OLD_PROTO_IMPORT//\//\/}"'";#import "'"${NEW_PROTO_IMPORT//\//\/}"'";#g' "$f"
  for t in ${TYPE_NAMES}; do
    perl -0pi -e 's/\b'"${OLD_PROTO_PACKAGE//./\\.}"'\.'"$t"'\b/'"${NEW_PROTO_PACKAGE//./\\.}"'.'"$t"'/g' "$f"
  done
done < /tmp/mig_proto_files.txt
```

### 3.4 Update proto BUILD deps

Replace old exported proto targets with the new target:

- `//rs/platform/library/scalar/proto:${MODULE}_proto`
- `//rs/platform/types/${MODULE}:${MODULE}_proto`

Example:

```bash
while IFS= read -r f; do
  perl -0pi -e 's#"'"${OLD_EXPORT_PROST_TARGET//\//\/}"'"#"'"${NEW_EXPORT_PROST_TARGET//\//\/}"'"#g' "$f"
done < /tmp/mig_proto_build_files.txt
```

This search may include `iosapp/AppClips/Location/BUILD.bazel`, which is expected.

### 3.5 Add Rust BUILD deps

For each impacted Rust BUILD file, add the destination crate:

- `//rs/platform/types/${MODULE}`

Important:

- add the new dep when the target now imports `types_${MODULE}`
- keep `//rs/platform/library/scalar` if that target still uses other scalar symbols
- do not remove broad deps by hand; let cleanup tools prove removals later

### 3.6 Iterate on compile failures

Run:

```bash
./tools/clippy.py
```

Fix in this order:

1. missing proto BUILD deps
2. missing Rust BUILD deps
3. incomplete import rewrites
4. AppClip or web fallout
5. formatting/lint fallout from touched files

### 3.7 Known edge cases

#### AppClip

Inspect `iosapp/AppClips/Location/BUILD.bazel` when the moved proto is consumed by AppClip Swift proto targets.

Typical fix shape:

- replace `//rs/platform/library/scalar/proto:${MODULE}_proto` with `//rs/platform/types/${MODULE}:${MODULE}_proto`

#### Web

Search `web/` for old proto import paths or stale package names.

If any web file changes, run:

```bash
pnpm -r --filter='!sugar' lint --fix
```

#### Existing types crates that reference the moved type

Do not forget dependent types crates like `rs/platform/types/location`.

A migrated type may already be referenced by another `rs/platform/types/*` crate, so those crates may need:

- Rust import rewrites
- proto import rewrites
- BUILD dep updates

## Step 4: Cleanup and formatting

Run cleanup tools after the repo compiles again.

### 4.1 Unused Rust deps/imports

Run:

```bash
./tools/unused_imports.py
```

### 4.2 Unused proto imports

Run:

```bash
./tools/proto_unused_imports.py --auto-fix
```

### 4.3 Formatting

If the `allfmt` alias is available in your shell, you can use it.

Alias source: `/Users/lucas/dotfiles/zsh/.config/zsh/zshrc.d/50-aliases.zsh`

Its effective expansion is:

```bash
./tools/rustfmt $(git ls-files | grep -E '\.rs$')
find . -regex ".*\.proto" | xargs clang-format --style Google --assume-filename .proto -i
buildifier -r rs web tools
```

In non-interactive automation, prefer the explicit commands above because zsh aliases may not be loaded.

### 4.4 Final compile check

Run again:

```bash
./tools/clippy.py
```

## Step 5: Final invariants

These must be empty for the migrated types.

```bash
# old Rust refs
rg -nUP 'use\s+scalar::\{[^}]*\b(TypeA|TypeB)\b[^}]*\}|\bscalar::(TypeA|TypeB)\b|^use scalar::(TypeA|TypeB);$' rs -g '*.rs'

# old proto package refs
rg -n 'platform\.scalar\.(TypeA|TypeB)' . -g '*.proto'

# old proto import path
rg -n 'import "platform/library/scalar/proto/<module>.proto";' . -g '*.proto'

# old proto BUILD target
rg -n '"//rs/platform/library/scalar/proto:<module>_proto"' . -g 'BUILD.bazel'
```

Replace `TypeA|TypeB` and `<module>` with the concrete migration.

## Step 6: Commit the repo-wide migration

After compile, cleanup, and formatting pass, commit with:

```text
migrate
```

Default expectation is exactly these three commits in order:

1. `boilerplate`
2. `compile`
3. `migrate`

Only add extra commits if explicitly requested or if the fallout is unusually large and clearly benefits from separation.
