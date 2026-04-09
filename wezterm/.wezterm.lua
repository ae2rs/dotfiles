local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action
local color_scheme = "Tokyo Night Storm"
local scheme = wezterm.color.get_builtin_schemes()[color_scheme]
local palette = {
	bg = scheme.background,
	fg = scheme.foreground,
	surface = scheme.tab_bar and scheme.tab_bar.inactive_tab and scheme.tab_bar.inactive_tab.bg_color
		or scheme.background,
	muted = scheme.tab_bar and scheme.tab_bar.inactive_tab and scheme.tab_bar.inactive_tab.fg_color
		or scheme.brights[1],
	blue = scheme.ansi[5],
	green = scheme.ansi[3],
	yellow = scheme.ansi[4],
	aqua = scheme.ansi[7],
}

-- General --
config.font_size = 16
config.line_height = 1
config.font = wezterm.font("JetBrains Mono")
config.color_scheme = color_scheme
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
	active_titlebar_bg = palette.bg,
	inactive_titlebar_bg = palette.surface,
	active_titlebar_fg = palette.fg,
	inactive_titlebar_fg = palette.muted,
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
map("q", "CMD", wezterm.action.QuitApplication)
map("LeftArrow", "CMD", act.SendString("\x1bOH"))
map("RightArrow", "CMD", act.SendString("\x1bOF"))
map("LeftArrow", "OPT", act.SendString("\x1bb"))
map("RightArrow", "OPT", act.SendString("\x1bf"))
map("Backspace", "CMD", act.SendKey({ mods = "CTRL", key = "w" }))

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

local disk_usage_cache = " -- "
local disk_usage_last = 0
local function disk_usage()
	local now = os.time()
	if now - disk_usage_last < 30 then
		return disk_usage_cache
	end

	local popen = io and io.popen
	if not popen then
		disk_usage_last = now
		return disk_usage_cache
	end

	local handle = popen("(df -k /System/Volumes/Data 2>/dev/null || df -k / 2>/dev/null) | tail -1")
	if not handle then
		disk_usage_cache = " -- "
		disk_usage_last = now
		return disk_usage_cache
	end

	local output = handle:read("*a") or ""
	handle:close()

	local fields = {}
	for field in output:gmatch("%S+") do
		table.insert(fields, field)
	end

	local total_kb = tonumber(fields[2])
	local used_kb = tonumber(fields[3])
	if not total_kb or not used_kb or total_kb == 0 then
		disk_usage_cache = " -- "
		disk_usage_last = now
		return disk_usage_cache
	end

	local used_pct = tonumber((fields[5] or ""):match("(%d+)%%"))
	if not used_pct then
		used_pct = math.floor((used_kb / total_kb) * 100 + 0.5)
	end
	disk_usage_cache = string.format(" %d%% ", used_pct)
	disk_usage_last = now
	return disk_usage_cache
end

local net_rx_last = 0
local net_tx_last = 0
local net_time_last = 0
local net_cache = " -- "
local function net_usage()
	local now = os.time()
	local dt = now - net_time_last
	if dt < 2 then
		return net_cache
	end

	local handle = io.popen("netstat -ibn 2>/dev/null | awk '/^en/ {rx+=$7; tx+=$10} END {print rx, tx}'")
	if not handle then
		return net_cache
	end

	local output = handle:read("*a") or ""
	handle:close()

	local rx, tx = output:match("(%d+)%s+(%d+)")
	rx = tonumber(rx)
	tx = tonumber(tx)

	if not rx or not tx then
		return net_cache
	end

	if net_time_last > 0 and dt > 0 then
		local rx_rate = (rx - net_rx_last) / dt
		local tx_rate = (tx - net_tx_last) / dt

		local function fmt(bytes)
			if bytes >= 1024 * 1024 then
				return string.format("%.1fM", bytes / (1024 * 1024))
			elseif bytes >= 1024 then
				return string.format("%.0fK", bytes / 1024)
			else
				return string.format("%dB", math.max(0, bytes))
			end
		end

		net_cache = wezterm.format({
			{ Text = " " },
			{ Foreground = { Color = palette.blue } },
			{ Text = "↓" },
			{ Foreground = { Color = palette.fg } },
			{ Text = fmt(rx_rate) .. " " },
			{ Foreground = { Color = palette.green } },
			{ Text = "↑" },
			{ Foreground = { Color = palette.fg } },
			{ Text = fmt(tx_rate) .. " " },
		})
	end

	net_rx_last = rx
	net_tx_last = tx
	net_time_last = now
	return net_cache
end

tabline.setup({
	options = {
		icons_enabled = true,
		theme = color_scheme,
		tabs_enabled = true,
		theme_overrides = {
			normal_mode = {
				c = { fg = palette.fg, bg = palette.bg },
			},
			tab = {
				active = { fg = palette.yellow, bg = palette.bg },
				inactive = { fg = palette.fg, bg = palette.bg },
				inactive_hover = { fg = palette.aqua, bg = palette.bg },
			},
		},
		section_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thin,
			right = wezterm.nerdfonts.ple_left_half_circle_thin,
		},
		component_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thin,
			right = "|",
		},
		tab_separators = {
			left = " ",
			right = " ",
		},
	},
	sections = {
		tabline_a = { { "", cond = false } },
		tabline_b = { { "", cond = false } },
		tabline_c = { { "", cond = false } },
		tab_active = {
			"index",
			{ "cwd", padding = { left = 0, right = 1 } },
		},
		tab_inactive = {
			"index",
			{ "cwd", padding = { left = 0, right = 1 } },
		},
		tabline_x = {
			{ "ram", icons_enabled = false },
			{ "cpu", icons_enabled = false },
			net_usage,
			disk_usage,
		},
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
