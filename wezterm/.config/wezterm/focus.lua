local wezterm = require("wezterm")

local M = {}

-- Absolute: a WezTerm started from the Dock has no Homebrew on its PATH.
local aerospace = "/opt/homebrew/bin/aerospace"

-- The title WezTerm gives the OS window by default, which is how AeroSpace
-- names it: "[2/3] rho" with several tabs, "rho" with one.
local function window_title(mux_window, pane)
	local tabs = mux_window:tabs_with_info()
	if #tabs == 1 then
		return pane:get_title()
	end
	local tab_id = pane:tab():tab_id()
	for _, info in ipairs(tabs) do
		if info.tab:tab_id() == tab_id then
			return string.format("[%d/%d] %s", info.index + 1, #tabs, pane:get_title())
		end
	end
end

-- AeroSpace hides windows on other workspaces, so window:focus() alone
-- leaves this one behind whatever workspace is showing. Its window ids are
-- not WezTerm's, so the window is found by title: exactly, else by the only
-- title ending in the pane's.
local function aerospace_focus(mux_window, pane)
	local ok, listing = wezterm.run_child_process({
		aerospace,
		"list-windows",
		"--monitor",
		"all",
		"--app-bundle-id",
		"com.github.wez.wezterm",
		"--format",
		"%{window-id}\t%{window-title}",
	})
	if not ok then
		return
	end
	local expected = window_title(mux_window, pane)
	local suffix = " " .. pane:get_title()
	local exact, endings = nil, {}
	for id, title in listing:gmatch("(%d+)\t([^\n]*)") do
		if title == expected then
			exact = id
		elseif title:sub(-#suffix) == suffix then
			table.insert(endings, id)
		end
	end
	local target = exact or (#endings == 1 and endings[1]) or nil
	if target then
		wezterm.run_child_process({ aerospace, "focus", "--window-id", target })
	end
end

-- A program brings its own pane to the front by setting the focus_pane user
-- var (OSC 1337 SetUserVar) -- rho does when its desktop notification is
-- clicked. The value only has to change for the event to fire, so it is
-- ignored. The event reaches the window holding the pane, which is the one
-- to raise even when another WezTerm window was used last.
function M.apply_to_config(_)
	wezterm.on("user-var-changed", function(window, pane, name, _)
		if name ~= "focus_pane" then
			return
		end
		pane:activate()
		window:focus()
		local mux_window = window:mux_window()
		-- Later, so the OS window title has caught up with the tab switch.
		wezterm.time.call_after(0.2, function()
			aerospace_focus(mux_window, pane)
		end)
	end)
end

return M
