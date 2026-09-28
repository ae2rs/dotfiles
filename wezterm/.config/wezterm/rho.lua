local wezterm = require("wezterm")
local act = wezterm.action

local M = {}

-- rho draws on the alternate screen, which has no scrollback for copy mode to
-- reach. Sent its handoff key, rho prints the whole transcript onto the normal
-- screen and sets the rho_scrollback user var to "1" once every row is there,
-- which is when copy mode opens. Closing copy mode sends the key again, which
-- wipes the printout and brings rho's frame back. SendKey goes straight to the
-- pane, so the key being the LEADER does not matter.
local handoff = act.SendKey({ key = "s", mods = "CTRL" })

local function is_rho(pane)
	local process = pane:get_foreground_process_name()
	return process ~= nil and process:match("/rho$") ~= nil
end

-- Checks the process too: a rho that died mid-handoff leaves the var set, and
-- ctrl+s would then reach the shell as XOFF.
local function showing(pane)
	return is_rho(pane) and pane:get_user_vars().rho_scrollback == "1"
end

M.copy_mode = wezterm.action_callback(function(window, pane)
	if is_rho(pane) and not showing(pane) then
		window:perform_action(handoff, pane)
	else
		window:perform_action(act.ActivateCopyMode, pane)
	end
end)

local function close(before)
	return wezterm.action_callback(function(window, pane)
		if before then
			window:perform_action(before, pane)
		end
		window:perform_action(act.CopyMode("Close"), pane)
		if showing(pane) then
			window:perform_action(handoff, pane)
		end
	end)
end

-- The default copy-mode keys that close it, each now also returning to rho.
local closing = {
	{ key = "Escape", mods = "NONE", action = close() },
	{ key = "q", mods = "NONE", action = close() },
	{ key = "c", mods = "CTRL", action = close() },
	{ key = "g", mods = "CTRL", action = close() },
	{ key = "y", mods = "NONE", action = close(act.CopyTo("ClipboardAndPrimarySelection")) },
}

function M.apply_to_config(config)
	-- Only the GUI has key tables; the mux server evaluates this file too.
	if not wezterm.gui then
		return
	end
	local copy_mode = {}
	for _, entry in ipairs(wezterm.gui.default_key_tables().copy_mode) do
		local replaced = false
		for _, override in ipairs(closing) do
			if entry.key == override.key and (entry.mods or "NONE") == override.mods then
				replaced = true
			end
		end
		if not replaced then
			table.insert(copy_mode, entry)
		end
	end
	for _, override in ipairs(closing) do
		table.insert(copy_mode, override)
	end
	config.key_tables = config.key_tables or {}
	config.key_tables.copy_mode = copy_mode

	wezterm.on("user-var-changed", function(window, pane, name, value)
		if name == "rho_scrollback" and value == "1" then
			window:perform_action(act.ActivateCopyMode, pane)
		end
	end)
end

return M
