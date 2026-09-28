local wezterm = require("wezterm")
local theme = require("theme")

local M = {}

function M.apply_to_config(config)
	config.color_scheme = theme.name
	config.font_size = 16
	config.line_height = 1
	config.font = wezterm.font("JetBrains Mono")
	-- wezterm#8097 widened the automatic bold/dim weight offsets; keep the
	-- pre-nightly JetBrains Mono appearance instead of ExtraBold and Thin.
	config.font_rules = {
		{
			intensity = "Bold",
			italic = true,
			font = wezterm.font("JetBrains Mono", { weight = "DemiBold", style = "Italic" }),
		},
		{
			intensity = "Bold",
			italic = false,
			font = wezterm.font("JetBrains Mono", { weight = "DemiBold" }),
		},
		{
			intensity = "Half",
			italic = true,
			font = wezterm.font("JetBrains Mono", { weight = "ExtraLight", style = "Italic" }),
		},
		{
			intensity = "Half",
			italic = false,
			font = wezterm.font("JetBrains Mono", { weight = "ExtraLight" }),
		},
	}
	config.default_cursor_style = "SteadyBar"
	config.audible_bell = "Disabled"
	config.window_close_confirmation = "NeverPrompt"

	config.window_decorations = "RESIZE"
	config.window_frame = {
		border_top_height = "2px",
		active_titlebar_bg = theme.palette.bg,
		inactive_titlebar_bg = theme.palette.surface,
		active_titlebar_fg = theme.palette.fg,
		inactive_titlebar_fg = theme.palette.muted,
	}
	config.window_padding = {
		left = "1cell",
		right = "1cell",
		top = "0",
		bottom = 0,
	}
end

return M
