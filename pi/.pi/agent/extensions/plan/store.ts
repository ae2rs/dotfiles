import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type FileMutationQueue = <T>(filePath: string, operation: () => Promise<T>) => Promise<T>;

export function sessionStoreDir(sessionId: string, agentDir: string): string {
	return join(agentDir, "plans", sessionId);
}

export function planFileFor(sessionId: string, agentDir: string): string {
	return join(sessionStoreDir(sessionId, agentDir), "plan.md");
}

export class SessionPlanStore {
	constructor(
		readonly file: string,
		private readonly withMutationQueue: FileMutationQueue,
	) {}

	async read(): Promise<string> {
		try {
			return await readFile(this.file, "utf8");
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
			throw error;
		}
	}

	async write(content: string): Promise<void> {
		await this.withMutationQueue(this.file, async () => {
			await mkdir(dirname(this.file), { recursive: true });
			await writeFile(this.file, content, "utf8");
		});
	}

	async edit(oldText: string, newText: string): Promise<void> {
		await this.withMutationQueue(this.file, async () => {
			const current = await this.read();
			const occurrences = current.split(oldText).length - 1;
			if (occurrences !== 1) {
				throw new Error(
					occurrences === 0
						? "The requested text was not found in the plan. Read it again and retry."
						: "The requested text occurs multiple times in the plan. Provide more context.",
				);
			}
			await writeFile(this.file, current.replace(oldText, newText), "utf8");
		});
	}
}
