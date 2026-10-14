# neo: how to iterate

A red gate should mean a real bug, and a green one should come fast. Run the narrowest command that covers your change while you work. Run the broad gates only at the end.

## While working

- Rust: `just test rs -p <crate>` or `just test rs -E 'test(<name>)'`. Never run bare `cargo nextest`: `just test rs` starts the database, the asset store and SABnzbd, and without them whole groups of tests fail for no real reason. For a quick lint, use `cd rs && cargo clippy -p <crate> --all-targets`.
- Web: `cd web && bun run check` (svelte-check), and `just test web` for Vitest.
- One Playwright spec: `just test mock e2e/mock/<spec>.ts` or `just test e2e e2e/<spec>.ts`. These build what they need and pick free ports.
- After an API change: `just gen`, then commit the regenerated client with the change.

## Before committing

- `just check changed`. It runs the gates that the files changed since `main`'s merge base (committed or not) can affect, and it prints what it skipped and why. On `main` itself, that means the uncommitted changes.

## Before merging

- `just check`, once, in the foreground. It runs format and shellcheck, then the Rust and web gates side by side (logs in `.local/check/<lane>.log`; a failed lane prints the end of its log), then both Playwright suites. Each step's time is listed at the end. A no-change run takes about 45 s.

## Never

- Never edit files in a checkout while a check or test run is going there, and never run two checks in one checkout. The rebuilds this forces mid-run made checks take 15 minutes.
- Never rerun a failed gate hoping it passes. The suites are not flaky, so read the failure. If a test really is timing-dependent, fix the test.
- Never set `split-debuginfo` back to `unpacked`, which is macOS's default. It leaves every rebuild's object files in `rs/target/debug/deps` forever (rust-lang/rust#161824), and every compiler start then slows down.
