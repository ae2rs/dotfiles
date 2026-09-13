/**
 * §5 measurement harness: hashline vs replace, per model.
 *
 * Each task is a small workspace with mechanical bugs, a plain-English
 * description, and a checker that asserts correct behavior. A run is one
 * isolated directory and one `pi -p` invocation, scored by the checker.
 * Metrics come from pi's `--mode json` event stream: failed edit calls and
 * assistant output tokens.
 *
 * Usage:
 *   bun run.ts [modelFilter]          # replace vs hashline
 *   bun run.ts prompts [modelFilter]  # full vs compact hashline prompt
 */
import { $ } from "bun";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PI = `${process.env.HOME}/.local/bin/pi`;
const ROOT = "/tmp/hl-bench";
const SWEEP = process.argv[2] === "prompts" ? "prompts" : "modes";
const RUNS = join(ROOT, "runs");
const RESULTS = join(ROOT, SWEEP === "prompts" ? "results2.jsonl" : "results.jsonl");

interface Task {
	id: string;
	file: string; // path within the run dir
	extraFiles?: Record<string, string>; // additional workspace files
	source: string; // buggy content the model sees
	description: string;
	check: string; // shell command run in the run dir; exit 0 = pass
}

const TS_PROLOG = `export interface Item { id: number; price: number; discount: number; }
const TAX_RATE = 0.08;

export function totalWithoutTax(items: Item[]): number {
\treturn items.reduce((sum, item) => sum + item.price, 0);
}

export function discountFor(item: Item): number {
\treturn item.price * item.discount;
}

export function grandTotal(items: Item[]): number {
\tconst net = totalWithoutTax(items) - items.reduce((sum, item) => sum + discountFor(item), 0);
\treturn net * (1 + TAX_RATE);
}
`;

const PY_PROLOG = `def clamp(value, low, high):
    return max(low, min(value, high))


def moving_average(values, window):
    if window <= 0:
        return []
    out = []
    for i in range(len(values) - window + 1):
        out.append(sum(values[i : i + window]) / window)
    return out
`;

const TASKS: Task[] = [
	{
		id: "ts-operator-swap",
		file: "cart.ts",
		source: TS_PROLOG + `\nexport function netAfterDiscount(item: Item): number {
\treturn item.price - discountFor(item);
}
`,
		description:
			"Fix the bug in `cart.ts`. In `netAfterDiscount`, an operator was swapped: it multiplies the price by the discount instead of subtracting the discounted amount. Restore the correct subtraction.",
		check: `bun -e 'const m = await import("./cart.ts"); const item = {id:1,price:200,discount:0.25}; if (m.netAfterDiscount(item) !== 150) process.exit(1)'`,
	},
	{
		id: "py-boolean-flip",
		file: "guard.py",
		source: `def is_adult(age):
    return age >= 18


def can_enter(age, has_ticket):
    if not is_adult(age):
        return False
    return not has_ticket


def admission_label(age, has_ticket):
    return "allowed" if can_enter(age, has_ticket) else "denied"
`,
		description:
			"Fix the bug in `guard.py`. A boolean was flipped: `can_enter` returns `not has_ticket` where it should return `has_ticket`. Adults without a ticket are being let in and ticket holders denied. Restore the correct condition.",
		check: `python3 -c "from guard import can_enter; assert can_enter(20, True) is True and can_enter(20, False) is False and can_enter(10, True) is False"`,
	},
	{
		id: "py-off-by-one",
		file: "pairs.py",
		source: PY_PROLOG + `
def adjacent_pairs(values):
    pairs = []
    for i in range(len(values)):
        pairs.append((values[i], values[i + 1]))
    return pairs
`,
		description:
			"Fix the bug in `pairs.py`. An off-by-one error was introduced: the loop in `adjacent_pairs` runs one index too far and crashes with IndexError on the last element. It should produce one pair per adjacent couple.",
		check: `python3 -c "from pairs import adjacent_pairs; assert adjacent_pairs([1,2,3]) == [(1,2),(2,3)] and adjacent_pairs([]) == []"`,
	},
	{
		id: "ts-identifier-rename",
		file: "client.ts",
		source: `export interface Options { retries: number; timeoutMs: number; }

export function defaults(): Options {
\treturn { retries: 3, timeoutMs: 1000 };
}

export function retryDelay(opts: Options, attempt: number): number {
\treturn opts.timeoutMS * attempt;
}

export function maxWait(opts: Options): number {
\treturn retryDelay(opts, opts.retries);
}
`,
		description:
			"Fix the bug in `client.ts`. An identifier was renamed: `retryDelay` reads `opts.timeoutMS`, but the `Options` interface declares `timeoutMs`. TypeScript rejects the access. Restore the correct field name.",
		check: `bun -e 'const m = await import("./client.ts"); if (m.maxWait({retries:3,timeoutMs:500}) !== 1500) process.exit(1)'`,
	},
	{
		id: "py-wrong-constant",
		file: "price.py",
		source: PY_PROLOG + `
def volume_price(length, width, height, price_per_unit):
    volume = length * width * height
    return 2 * volume * price_per_unit
`,
		description:
			"Fix the bug in `price.py`. A constant was changed: `volume_price` multiplies by 2 where it should multiply by 3, undercharging for every order. Restore the correct multiplier.",
		check: `python3 -c "from price import volume_price; assert volume_price(2, 3, 4, 10) == 720"`,
	},
	{
		id: "ts-removed-guard",
		file: "user.ts",
		source: `export interface User { name: string | null; }

export function greet(user: User): string {
\treturn \`Hello, \${user.name.trim()}!\`;
}

export function shout(user: User): string {
\treturn greet(user).toUpperCase();
}
`,
		description:
			"Fix the bug in `user.ts`. A guard clause (early return) was removed from `greet`, so a user whose name is null crashes with a TypeError on `.trim()`. Restore a null guard that returns `Hello, guest!` instead.",
		check: `bun -e 'const m = await import("./user.ts"); if (m.greet({name:null}) !== "Hello, guest!") process.exit(1); if (m.greet({name:" ada "}) !== "Hello, ada!") process.exit(1)'`,
	},
	{
		id: "ts-multi-hunk",
		file: "invoice.ts",
		source: `export interface Line { qty: number; unit: number; }

export function lineTotal(line: Line): number {
\treturn line.qty - line.unit;
}

export function subtotal(lines: Line[]): number {
\treturn lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function shipping(lines: Line[]): number {
\treturn subtotal(lines) > 100 ? 0 : 9;
}

export function invoiceTotal(lines: Line[]): number {
\tconst handling = 2 * lines.length;
\treturn subtotal(lines) + shipping(lines) + handling;
}
`,
		description:
			"Fix two bugs in `invoice.ts`. First, `lineTotal` subtracts where it should multiply qty by unit price. Second, `invoiceTotal` charges a handling fee of 2 per line where it should be 5 per line. Fix both, nothing else.",
		check: `bun -e 'const m = await import("./invoice.ts"); const ls=[{qty:4,unit:10},{qty:1,unit:5}]; if (m.lineTotal(ls[0]) !== 40) process.exit(1); if (m.invoiceTotal(ls) !== 45 + 9 + 10) process.exit(1)'`,
	},
	{
		id: "py-cross-file-move",
		file: "helpers.py",
		extraFiles: {
			"main.py": `from helpers import slugify, greet


def render(name, title):
	    return greet(name) + " | " + slugify(title)
`,
		},
		source: `def slugify(text):
	    return text.lower().replace(" ", "-")


def greet(name):
	    return "Hello, " + name
`,
		description:
			"Refactor: move the `greet` function from `helpers.py` into `main.py`, and update the import in `main.py` so it no longer imports `greet` from helpers. `slugify` must stay in `helpers.py`. Behavior must not change.",
		check: `python3 -c "from main import render, greet; from helpers import slugify; assert render('ada','My Post') == 'Hello, ada | my-post'; assert not hasattr(__import__('helpers'), 'greet')"`,
	},
];

const PROMPT = (task: Task) =>
	`You are in a workspace containing a mechanical code bug. ${task.description}\n\n` +
	`Use the read tool to look at the file, then use the edit tool to fix exactly that bug and nothing else. ` +
	`Do not reformat the file, do not rewrite it with write, and do not explain — just make the fix.`;

interface RunMetrics {
	model: string;
	mode: string;
	task: string;
	run: number;
	pass: boolean;
	editCalls: number;
	editFailures: number;
	otherFailures: number;
	outputTokens: number;
	wallMs: number;
	timeout: boolean;
}

const TIMEOUT_MS = 10 * 60 * 1000;

async function oneRun(model: string, variant: Variant, task: Task, run: number): Promise<RunMetrics> {
	const dir = join(RUNS, `${model.replaceAll("/", "-")}-${variant.label}-${task.id}-${run}`);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, task.file), task.source);
	for (const [name, content] of Object.entries(task.extraFiles ?? {})) {
		writeFileSync(join(dir, name), content);
	}

	const env = {
		...process.env,
		...variant.env,
		PI_MEMORY_DB: join(dir, "mem.db"),
		CLAUDE_BRIDGE_ISOLATED: "1",
	};
	const args = [
		"-p", "--no-session", "--no-context-files", "--no-skills",
		"--mode", "json", "--model", model,
		"--tools", "read,edit,write",
		"--thinking", model.startsWith("llama-cpp") ? "low" : "medium",
		PROMPT(task),
	];

	const started = Date.now();
	let output = "";
	let timedOut = false;
	try {
		const proc = Bun.spawn([PI, ...args], { cwd: dir, env, stdout: "pipe", stderr: "ignore" });
		const killer = setTimeout(() => { timedOut = true; proc.kill(); }, TIMEOUT_MS);
		output = await new Response(proc.stdout).text();
		await proc.exited;
		clearTimeout(killer);
	} catch (err) {
		timedOut = true;
	}
	const wallMs = Date.now() - started;

	let editCalls = 0, editFailures = 0, otherFailures = 0, outputTokens = 0;
	for (const line of output.split("\n")) {
		if (!line.startsWith("{")) continue;
		let event: any;
		try { event = JSON.parse(line); } catch { continue; }
		if (event.type === "tool_execution_end") {
			if (event.toolName === "edit") {
				editCalls++;
				if (event.isError) editFailures++;
			} else if (event.isError) otherFailures++;
		}
		if (event.type === "message_end" && event.message?.role === "assistant") {
			outputTokens += event.message.usage?.output ?? 0;
		}
	}

	let pass = false;
	if (!timedOut) {
		try { pass = (await $`sh -c ${task.check}`.cwd(dir).quiet()).exitCode === 0; } catch { pass = false; }
	}

	return { model, mode: variant.label, task: task.id, run, pass, editCalls, editFailures, otherFailures, outputTokens, wallMs, timeout: timedOut };
}

interface Variant {
	label: string;
	env: Record<string, string>;
}

const SWEEPS: Record<string, { variants: Variant[]; matrix: { model: string; runs: number }[] }> = {
	modes: {
		variants: [
			{ label: "replace", env: { PI_EDIT_MODE: "replace" } },
			{ label: "hashline", env: { PI_EDIT_MODE: "hashline" } },
		],
		matrix: [
			{ model: "kimi-coding/k3", runs: 2 },
			// llama-cpp/early-router-flash dropped 2026-09-13: the LAN server at
			// 192.168.1.165:9999 is unreachable. Re-add when the host is back.
			{ model: "pi-claude/claude-opus-5", runs: 1 },
		],
	},
	prompts: {
		variants: [
			{ label: "full", env: { PI_EDIT_MODE: "hashline", PI_EDIT_PROMPT: "full" } },
			{ label: "compact", env: { PI_EDIT_MODE: "hashline", PI_EDIT_PROMPT: "compact" } },
		],
		matrix: [{ model: "kimi-coding/k3", runs: 2 }],
	},
};

const { variants, matrix: MATRIX } = SWEEPS[SWEEP];

const modelFilter = process.argv[3] ?? "";

mkdirSync(RUNS, { recursive: true });
const out = Bun.file(RESULTS);
const writer = out.writer();

for (const { model, runs } of MATRIX) {
	if (modelFilter && !model.includes(modelFilter)) continue;
	for (const variant of variants) {
		for (const task of TASKS) {
			for (let run = 1; run <= runs; run++) {
				const m = await oneRun(model, variant, task, run);
				console.log(
					`${model} ${variant.label} ${task.id}#${run}: ${m.pass ? "PASS" : "FAIL"} ` +
					`edit ${m.editFailures}/${m.editCalls} out=${m.outputTokens}tok ${(m.wallMs / 1000).toFixed(0)}s${m.timeout ? " TIMEOUT" : ""}`,
				);
				writer.write(JSON.stringify(m) + "\n");
				writer.flush();
			}
		}
	}
}
writer.end();
console.log(`\nWrote ${RESULTS}`);
