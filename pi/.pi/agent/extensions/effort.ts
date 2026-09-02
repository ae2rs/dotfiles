import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

type ThinkingAwareModel = {
	reasoning?: boolean;
	thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No extra reasoning",
	minimal: "Fastest reasoning",
	low: "Light reasoning",
	medium: "Balanced reasoning",
	high: "Deep reasoning",
	xhigh: "Extra-deep reasoning",
	max: "Maximum reasoning",
};

function getAvailableThinkingLevels(model: ThinkingAwareModel | undefined): ThinkingLevel[] {
	if (!model?.reasoning) return ["off"];

	const map = model.thinkingLevelMap ?? {};
	const supported = THINKING_LEVELS.filter((level) => {
		const value = map[level];
		if (value === null) return false;
		if (level === "xhigh" || level === "max") return typeof value === "string";
		return true;
	});

	return supported.length > 0 ? supported : ["off"];
}

function normalizeLevel(value: string): ThinkingLevel | undefined {
	return THINKING_LEVELS.find((level) => level === value.trim().toLowerCase());
}

export default function effortExtension(pi: ExtensionAPI) {
	pi.registerCommand("effort", {
		description: "Pick the current model's effort level",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			const items = THINKING_LEVELS.filter((level) => level.startsWith(normalized)).map((level) => ({
				value: level,
				label: level,
				description: LEVEL_DESCRIPTIONS[level],
			}));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const supported = getAvailableThinkingLevels(ctx.model as ThinkingAwareModel | undefined);
			const current = pi.getThinkingLevel();
			const requested = normalizeLevel(args);

			if (requested) {
				if (!supported.includes(requested)) {
					ctx.ui.notify(
						`Effort ${requested} is not available for ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "the current model"}`,
						"warning",
					);
					return;
				}

				pi.setThinkingLevel(requested);
				ctx.ui.notify(`Effort: ${requested}`, "info");
				return;
			}

			const choices = supported.map((level) =>
				`${level === current ? "• " : "  "}${level} — ${LEVEL_DESCRIPTIONS[level]}`,
			);
			const choice = await ctx.ui.select("Select effort", choices);
			if (!choice) return;

			const index = choices.indexOf(choice);
			const level = supported[index];
			if (!level) return;

			pi.setThinkingLevel(level);
			ctx.ui.notify(`Effort: ${level}`, "info");
		},
	});
}
