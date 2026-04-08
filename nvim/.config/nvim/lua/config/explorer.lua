local M = {}

function M.toggle()
  require('neo-tree.command').execute {
    toggle = true,
    reveal = true,
    source = 'filesystem',
    position = 'left',
  }
end

return M
