/**
 * icons — every glyph used by the statusline extension, in one place.
 *
 * All icons are from the Nerd Font Material Design (MDI) / devicon sets,
 * matching the glyphs already used across this dotfiles repo (sketchybar,
 * wezterm tab bar). Swap a glyph by editing the constant here.
 */

export const ICONS = {
	model: "󰚩",
	thinking: "󰧑",
	tool: "󰖱",
	branch: "",
	context: "󰨊",
	clock: "󰅐",
} as const;

/** MDI clock cycle, used for the adaptive working indicator. */
export const WORKING_FRAMES = ["󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"] as const;
