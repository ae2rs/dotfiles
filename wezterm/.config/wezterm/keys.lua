local wezterm = require("wezterm")
local act = wezterm.action

local M = {}

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
				table.insert(
					args,
					tostring(math.floor(info.width / (first.width + info.width) * 100 + 0.5))
				)
			end
		elseif info.top >= first.top + first.height then
			table.insert(args, "--bottom")
			if i == 2 then
				table.insert(args, "--percent")
				table.insert(
					args,
					tostring(math.floor(info.height / (first.height + info.height) * 100 + 0.5))
				)
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

-- QuitApplication never prompts on its own, so gate Cmd-q behind a picker
local confirmQuit = act.InputSelector({
	title = "Quit WezTerm?",
	choices = {
		{ label = "Cancel" },
		{ label = "Quit" },
	},
	action = wezterm.action_callback(function(window, pane, _, label)
		if label == "Quit" then
			window:perform_action(act.QuitApplication, pane)
		end
	end),
})

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
-- debug
map("l", "SHIFT|CTRL", act.ShowDebugOverlay)
map("r", { "LEADER", "SUPER" }, act.ActivateKeyTable({ name = "resize_mode", one_shot = false }))
-- Keep original macOS-style navigation keys
map("q", "CMD", confirmQuit)
map("LeftArrow", "CMD", act.SendString("\x1bOH"))
map("RightArrow", "CMD", act.SendString("\x1bOF"))
map("LeftArrow", "OPT", act.SendString("\x1bb"))
map("RightArrow", "OPT", act.SendString("\x1bf"))
map("Backspace", "CMD", act.SendKey({ mods = "CTRL", key = "u" }))

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

function M.apply_to_config(config)
	config.leader = {
		key = "s",
		mods = "CTRL",
		timeout_milliseconds = math.maxinteger,
	}
	config.keys = shortcuts
	config.disable_default_key_bindings = true
	config.key_tables = key_tables
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
	-- Needs the nightly build (see Brewfile): stable 20240203 encodes <Esc>
	-- key-down as a raw \e despite the disambiguate flag, so Neovim reads that
	-- byte as the prefix of the key-up event that follows and swallows the press,
	-- making Insert mode inescapable -- wezterm#7787.
	config.enable_kitty_keyboard = true
end

return M
