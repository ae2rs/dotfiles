local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- tab_bar goes first: the tabline plugin resets the window padding that
-- appearance sets.
for _, module in ipairs({ "tab_bar", "appearance", "keys", "focus" }) do
	require(module).apply_to_config(config)
end

-- Room for a whole rho transcript printed with ctrl+s, which copy mode then
-- reaches from its first row. The default of 3500 cuts long sessions short.
config.scrollback_lines = 100000

return config
