local wezterm = require("wezterm")

local M = {}

-- A program brings its own pane to the front by setting the focus_pane user
-- var (OSC 1337 SetUserVar) -- rho does when its desktop notification is
-- clicked. The value only has to change for the event to fire, so it is
-- ignored. The event reaches the window holding the pane, which is the one
-- to raise even when another WezTerm window was used last.
function M.apply_to_config(_)
	wezterm.on("user-var-changed", function(window, pane, name, _)
		if name == "focus_pane" then
			pane:activate()
			window:focus()
		end
	end)
end

return M
