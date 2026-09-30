local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- tab_bar goes first: the tabline plugin resets the window padding that
-- appearance sets.
for _, module in ipairs({ "tab_bar", "appearance", "keys" }) do
	require(module).apply_to_config(config)
end

-- rho's module, installed by its installer: click-to-focus for notifications,
-- copy mode over the whole transcript. After keys, which it adds to.
require("rho").apply_to_config(config)

return config
