local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- General --
config.font_size = 16
config.line_height = 1
config.font = wezterm.font("JetBrains Mono")
config.color_scheme = "tokyonight_night"
config.audible_bell = "Disabled"
config.window_close_confirmation = "NeverPrompt"
config.default_cursor_style = "SteadyBar"

-- Window
config.window_decorations = "RESIZE"
config.enable_tab_bar = true
config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.show_new_tab_button_in_tab_bar = false
config.tab_max_width = 32
config.window_frame = {
	border_top_height = "2px",
}

-- Keys --
local shortcuts = {}

local map = function(key, mods, action)
	if type(mods) == "string" then
		table.insert(shortcuts, { key = key, mods = mods, action = action })
	elseif type(mods) == "table" then
		for _, mod in pairs(mods) do
			table.insert(shortcuts, { key = key, mods = mod, action = action })
		end
	end
end

wezterm.GLOBAL.enable_tab_bar = true
local toggleTabBar = wezterm.action_callback(function(window)
	wezterm.GLOBAL.enable_tab_bar = not wezterm.GLOBAL.enable_tab_bar
	window:set_config_overrides({
		enable_tab_bar = wezterm.GLOBAL.enable_tab_bar,
	})
end)

local openUrl = act.QuickSelectArgs({
	label = "open url",
	patterns = { "https?://\\S+" },
	action = wezterm.action_callback(function(window, pane)
		local url = window:get_selection_text_for_pane(pane)
		wezterm.open_with(url)
	end),
})

-- use 'Backslash' to split horizontally
map("v", "LEADER", act.SplitHorizontal({ domain = "CurrentPaneDomain" }))
-- and 'Minus' to split vertically
map("-", "LEADER", act.SplitVertical({ domain = "CurrentPaneDomain" }))
-- map 1-9 to switch to tab 1-9, 0 for the last tab
for i = 1, 9 do
	map(tostring(i), { "LEADER", "SUPER" }, act.ActivateTab(i - 1))
end
map("0", { "LEADER", "SUPER" }, act.ActivateTab(-1))
-- 'hjkl' to move between panes
map("h", { "LEADER", "SUPER" }, act.ActivatePaneDirection("Left"))
map("j", { "LEADER", "SUPER" }, act.ActivatePaneDirection("Down"))
map("k", { "LEADER", "SUPER" }, act.ActivatePaneDirection("Up"))
map("l", { "LEADER", "SUPER" }, act.ActivatePaneDirection("Right"))
-- resize
map("h", "LEADER|SHIFT", act.AdjustPaneSize({ "Left", 5 }))
map("j", "LEADER|SHIFT", act.AdjustPaneSize({ "Down", 5 }))
map("k", "LEADER|SHIFT", act.AdjustPaneSize({ "Up", 5 }))
map("l", "LEADER|SHIFT", act.AdjustPaneSize({ "Right", 5 }))
-- spawn & close
map("t", "LEADER", act.SpawnTab("CurrentPaneDomain"))
map("x", "LEADER", act.CloseCurrentPane({ confirm = true }))
map("t", { "SHIFT|CTRL", "SUPER" }, act.SpawnTab("CurrentPaneDomain"))
map("w", { "SHIFT|CTRL", "SUPER" }, act.CloseCurrentTab({ confirm = true }))
map("n", { "SHIFT|CTRL", "SUPER" }, act.SpawnWindow)
-- zoom states
map("z", { "LEADER", "SUPER" }, act.TogglePaneZoomState)
map("Z", { "LEADER", "SUPER" }, toggleTabBar)
-- copy & paste
map("c", "LEADER", act.ActivateCopyMode)
map("c", { "SHIFT|CTRL", "SUPER" }, act.CopyTo("Clipboard"))
map("v", { "SHIFT|CTRL", "SUPER" }, act.PasteFrom("Clipboard"))
map("f", { "SHIFT|CTRL", "SUPER" }, act.Search("CurrentSelectionOrEmptyString"))
-- rotation
map("e", { "LEADER", "SUPER" }, act.RotatePanes("Clockwise"))
-- pickers
map(" ", "LEADER", act.QuickSelect)
map("o", { "LEADER", "SUPER" }, openUrl)
map("p", { "LEADER", "SUPER" }, act.PaneSelect({ alphabet = "asdfghjkl;" }))
map("R", { "LEADER", "SUPER" }, act.ReloadConfiguration)
map("u", "SHIFT|CTRL", act.CharSelect)
map("p", { "SHIFT|CTRL", "SHIFT|SUPER" }, act.ActivateCommandPalette)
-- view
map("Enter", "ALT", act.ToggleFullScreen)
map("-", { "CTRL", "SUPER" }, act.DecreaseFontSize)
map("=", { "CTRL", "SUPER" }, act.IncreaseFontSize)
map("0", { "CTRL", "SUPER" }, act.ResetFontSize)
-- switch fonts
map("f", "LEADER", act.EmitEvent("switch-font"))
-- debug
map("l", "SHIFT|CTRL", act.ShowDebugOverlay)
-- terminal control
map("Enter", "SHIFT", wezterm.action({ SendString = "\x1b\r" }))

map(
	"r",
	{ "LEADER", "SUPER" },
	act.ActivateKeyTable({
		name = "resize_mode",
		one_shot = false,
	})
)

-- Keep original macOS-style navigation keys
map("LeftArrow", "CMD", act.SendString("\x1bOH"))
map("RightArrow", "CMD", act.SendString("\x1bOF"))
map("LeftArrow", "OPT", act.SendString("\x1bb"))
map("RightArrow", "OPT", act.SendString("\x1bf"))
map("Backspace", "CMD", act.SendKey({ mods = "CTRL", key = "u" }))

-- Leader key configuration
config.leader = {
	key = "s",
	mods = "CTRL",
	timeout_milliseconds = math.maxinteger,
}
config.keys = shortcuts
config.disable_default_key_bindings = true

-- Plugins --
local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

tabline.setup({
	options = {
		icons_enabled = true,
		theme = "tokyonight_night",
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
	top = "0",
	bottom = 0,
}

-- Key tables --
local key_tables = {
	resize_mode = {
		{ key = "h", action = act.AdjustPaneSize({ "Left", 1 }) },
		{ key = "j", action = act.AdjustPaneSize({ "Down", 1 }) },
		{ key = "k", action = act.AdjustPaneSize({ "Up", 1 }) },
		{ key = "l", action = act.AdjustPaneSize({ "Right", 1 }) },
		{ key = "LeftArrow", action = act.AdjustPaneSize({ "Left", 1 }) },
		{ key = "DownArrow", action = act.AdjustPaneSize({ "Down", 1 }) },
		{ key = "UpArrow", action = act.AdjustPaneSize({ "Up", 1 }) },
		{ key = "RightArrow", action = act.AdjustPaneSize({ "Right", 1 }) },
	},
}

-- add a common escape sequence to all key tables
for k, _ in pairs(key_tables) do
	table.insert(key_tables[k], { key = "Escape", action = "PopKeyTable" })
	table.insert(key_tables[k], { key = "Enter", action = "PopKeyTable" })
	table.insert(key_tables[k], { key = "c", mods = "CTRL", action = "PopKeyTable" })
end

config.key_tables = key_tables

-- Mouse bindings --
config.mouse_bindings = {
	{
		event = { Down = { streak = 1, button = { WheelUp = 1 } } },
		mods = "NONE",
		action = act.ScrollByLine(5),
	},
	{
		event = { Down = { streak = 1, button = { WheelDown = 1 } } },
		mods = "NONE",
		action = act.ScrollByLine(-5),
	},
}

return config
