local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action
local color_scheme = "Tokyo Night"
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
config.font_size = 15
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

-- pop the active pane out into a new window
local popPane = wezterm.action_callback(function(_, pane)
	pane:move_to_new_window()
end)

-- pop the whole tab out into a new window, keeping the panes as splits
local popTab = wezterm.action_callback(function(window, pane)
	local tab = window:active_tab()
	local infos = tab:panes_with_info()
	if #infos <= 1 then
		pane:move_to_new_window()
		return
	end

	-- Move the first pane into a new window, then split that pane and move
	-- each remaining pane into the new split. Direction (and size, for the
	-- second pane) comes from the original geometry; with 3+ panes nested
	-- layouts are approximated since every split targets the first pane.
	local first = infos[1]
	first.pane:move_to_new_window()
	for i = 2, #infos do
		local info = infos[i]
		local args = {
			wezterm.executable_dir .. "/wezterm",
			"cli",
			"split-pane",
			"--pane-id",
			tostring(first.pane:pane_id()),
		}
		if info.left >= first.left + first.width then
			table.insert(args, "--right")
			if i == 2 then
				table.insert(args, "--percent")
				table.insert(args, tostring(math.floor(info.width / (first.width + info.width) * 100 + 0.5)))
			end
		elseif info.top >= first.top + first.height then
			table.insert(args, "--bottom")
			if i == 2 then
				table.insert(args, "--percent")
				table.insert(args, tostring(math.floor(info.height / (first.height + info.height) * 100 + 0.5)))
			end
		elseif info.left + info.width <= first.left then
			table.insert(args, "--left")
		else
			table.insert(args, "--top")
		end
		table.insert(args, "--move-pane-id")
		table.insert(args, tostring(info.pane:pane_id()))
		wezterm.run_child_process(args)
	end
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
-- pop out to a new window
map("m", "LEADER", popPane) -- active pane only
map("M", "LEADER", popTab) -- whole tab
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
local plugin_cpu_component = require("tabline.components.window.cpu")

local cpu_usage_cache = " -- "
local cpu_usage_last = 0
local function cpu_usage()
	local is_darwin = string.match(wezterm.target_triple, "darwin") ~= nil
	if not is_darwin then
		local value = plugin_cpu_component.update(nil, plugin_cpu_component.default_opts)
		if value == "" then
			return cpu_usage_cache
		end
		return string.format(" %s ", value)
	end

	local now = os.time()
	if now - cpu_usage_last < 2 then
		return cpu_usage_cache
	end

	-- iostat reports system-wide CPU counters; the second sample avoids the
	-- boot-average first report and tracks real load better than ps %cpu.
	local success, output = wezterm.run_child_process({
		"iostat",
		"-C",
		"-n",
		"0",
		"-w",
		"1",
		"-c",
		"2",
	})
	if not success or not output then
		cpu_usage_last = now
		return cpu_usage_cache
	end

	local sample
	for line in output:gmatch("[^\r\n]+") do
		if line:match("^%s*%d") then
			sample = line
		end
	end

	if not sample then
		cpu_usage_last = now
		return cpu_usage_cache
	end

	local idle = tonumber(sample:match("^%s*%d+%s+%d+%s+(%d+)"))
	if not idle then
		cpu_usage_last = now
		return cpu_usage_cache
	end

	local used_pct = math.max(0, math.min(100, 100 - idle))
	cpu_usage_cache = string.format(" %d%% ", used_pct)
	cpu_usage_last = now
	return cpu_usage_cache
end

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

local claude_pct = nil
local claude_reset_ts = nil
local claude_last = 0
local function claude_usage()
	local now = os.time()

	-- clodo's daemon keeps cache.json fresh; re-read at most once a minute.
	if now - claude_last >= 60 then
		claude_last = now

		local clodo_dir = wezterm.home_dir .. "/.config/clodo"
		local config_file = io.open(clodo_dir .. "/config.toml", "r")
		local name = config_file and config_file:read("*a"):match('current%s*=%s*"([^"]+)"')
		if config_file then
			config_file:close()
		end

		if name then
			local cache_file = io.open(clodo_dir .. "/cache.json", "r")
			local body = cache_file and cache_file:read("*a")
			if cache_file then
				cache_file:close()
			end
			local ok, data = pcall(wezterm.json_parse, body or "")
			local entry = ok and data and data.entries and data.entries[name]
			local five_hour = entry and entry.usage and entry.usage.five_hour
			local pct = five_hour and tonumber(five_hour.utilization)
			local resets_at = five_hour and five_hour.resets_at
			local y, mo, d, h, mi, s
			if type(resets_at) == "string" then
				y, mo, d, h, mi, s = resets_at:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):([%d.]+)")
			end
			if pct then
				claude_pct = math.floor(pct + 0.5)
				-- resets_at is null when no 5h window is active (e.g. right
				-- after a reset); show the percentage without a countdown.
				if y then
					-- os.time() reads the table as local time; add the local/UTC
					-- offset to turn the UTC fields into a real epoch. isdst is
					-- cleared so mktime auto-detects DST (os.date("!*t") hardcodes
					-- isdst=false, which would skew the offset by an hour).
					local utc_now = os.date("!*t")
					utc_now.isdst = nil
					local utc_offset = os.difftime(os.time(), os.time(utc_now))
					claude_reset_ts = os.time({
						year = tonumber(y),
						month = tonumber(mo),
						day = tonumber(d),
						hour = tonumber(h),
						min = tonumber(mi),
						sec = math.floor(tonumber(s)),
					}) + utc_offset
				else
					claude_reset_ts = nil
				end
			end
		end
	end

	if not claude_pct then
		return " ○ -- "
	end

	local color = palette.green
	if claude_pct >= 80 then
		color = scheme.ansi[2]
	elseif claude_pct >= 50 then
		color = palette.yellow
	end

	-- Fill the gauge proportionally, using only glyphs native to JetBrains
	-- Mono so they share the cell metrics of the surrounding text (the
	-- half-circle codepoints fall back to Menlo and sit off-center).
	local gauge = { "○", "◔", "◕", "●" }
	local glyph = gauge[math.floor(claude_pct * 3 / 100 + 0.5) + 1]

	local items = {
		{ Text = " " },
		{ Foreground = { Color = color } },
		{ Text = glyph },
		{ Foreground = { Color = palette.fg } },
		{ Text = " " .. string.format("%d%%", claude_pct) },
	}

	if claude_reset_ts then
		local remaining = math.max(0, claude_reset_ts - now)
		local countdown
		if remaining < 60 then
			countdown = "<1m"
		elseif remaining < 3600 then
			countdown = string.format("%dm", math.floor(remaining / 60))
		else
			countdown = string.format("%dh%02dm", math.floor(remaining / 3600), math.floor((remaining % 3600) / 60))
		end
		table.insert(items, { Foreground = { Color = palette.muted } })
		table.insert(items, { Text = " · " .. countdown })
	end

	table.insert(items, { Text = " " })
	return wezterm.format(items)
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
			claude_usage,
			{ "ram", icons_enabled = false },
			cpu_usage,
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
