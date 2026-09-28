local wezterm = require("wezterm")
local theme = require("theme")
local palette = theme.palette

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

	local handle =
		popen("(df -k /System/Volumes/Data 2>/dev/null || df -k / 2>/dev/null) | tail -1")
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

	local handle =
		io.popen("netstat -ibn 2>/dev/null | awk '/^en/ {rx+=$7; tx+=$10} END {print rx, tx}'")
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
		theme = theme.name,
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
			cpu_usage,
			net_usage,
			disk_usage,
		},
		tabline_y = { { "", cond = false } },
		tabline_z = { { "", cond = false } },
	},
	extensions = {},
})

local M = {}

function M.apply_to_config(config)
	tabline.apply_to_config(config)
	config.enable_tab_bar = true
	config.use_fancy_tab_bar = false
	config.hide_tab_bar_if_only_one_tab = true
	config.show_new_tab_button_in_tab_bar = false
	config.tab_max_width = 32
end

return M
