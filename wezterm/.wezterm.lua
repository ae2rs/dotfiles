local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- General --
config.font_size = 16
config.line_height = 1
config.font = wezterm.font("JetBrains Mono")
config.color_scheme = "catppuccin-mocha"
config.audible_bell = "Disabled"

-- Window
config.window_decorations = "RESIZE"
config.enable_tab_bar = true
config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.show_new_tab_button_in_tab_bar = false
config.tab_max_width = 32
config.window_frame = {
	border_top_height = "3px",
}

-- Keys --
config.keys = {
	{
		key = "w",
		mods = "CMD",
		action = wezterm.action.CloseCurrentPane({ confirm = false }),
	},
	{
		key = "LeftArrow",
		mods = "CMD",
		action = wezterm.action({ SendString = "\x1bOH" }),
	},
	{
		key = "RightArrow",
		mods = "CMD",
		action = wezterm.action({ SendString = "\x1bOF" }),
	},
}

-- Plugins --
local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

tabline.setup({
	options = {
		icons_enabled = true,
		theme = "Catppuccin Mocha",
		tabs_enabled = true,
		theme_overrides = {},
		section_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thin,
			right = wezterm.nerdfonts.ple_left_half_circle_thin,
		},
		component_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thin,
			right = "|",
		},
		tab_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thick,
			right = wezterm.nerdfonts.ple_left_half_circle_thick,
		},
	},
	sections = {
		tabline_a = { { "", cond = false } },
		tabline_b = { { "", cond = false } },
		tabline_c = { { "", cond = false } },
		tab_active = {
			"index",
			{ "parent", padding = 0 },
			"/",
			{ "cwd", padding = { left = 0, right = 1 } },
		},
		tab_inactive = { "index", { "process", padding = { left = 0, right = 1 }, icons_enabled = false } },
		tabline_x = { { "ram", icons_enabled = false }, { "cpu", icons_enabled = false } },
		tabline_y = { { "", cond = false } },
		tabline_z = { { "", cond = false } },
	},
	extensions = {},
})

tabline.apply_to_config(config)

config.window_padding = {
	left = "1cell",
	right = "1cell",
	top = "0.3cell",
	bottom = 0,
}

return config
