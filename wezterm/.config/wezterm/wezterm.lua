local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- tab_bar goes first: the tabline plugin resets the window padding that
-- appearance sets.
for _, module in ipairs({ "tab_bar", "appearance", "keys", "focus" }) do
	require(module).apply_to_config(config)
end

return config
