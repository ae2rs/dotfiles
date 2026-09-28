local wezterm = require("wezterm")

local name = "Tokyo Night"
local scheme = wezterm.color.get_builtin_schemes()[name]

return {
	name = name,
	palette = {
		bg = scheme.background,
		fg = scheme.foreground,
		surface = scheme.tab_bar
				and scheme.tab_bar.inactive_tab
				and scheme.tab_bar.inactive_tab.bg_color
			or scheme.background,
		muted = scheme.tab_bar
				and scheme.tab_bar.inactive_tab
				and scheme.tab_bar.inactive_tab.fg_color
			or scheme.brights[1],
		blue = scheme.ansi[5],
		green = scheme.ansi[3],
		yellow = scheme.ansi[4],
		aqua = scheme.ansi[7],
	},
}
