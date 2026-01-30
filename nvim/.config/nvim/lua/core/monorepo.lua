-- Monorepo-specific configuration
-- Suppress linting for .proto files in monorepo

local MONOREPO_PATH = '/Users/lucas/work/monorepo'

-- Skip linting for .proto files in monorepo
vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWritePost', 'InsertLeave' }, {
  desc = 'Skip linting for .proto files in monorepo',
  group = vim.api.nvim_create_augroup('monorepo-skip-proto-lint', { clear = true }),
  callback = function()
    local buf_name = vim.api.nvim_buf_get_name(0)
    if buf_name:match('^' .. MONOREPO_PATH) and buf_name:match('%.proto$') then
      -- Clear any existing lint diagnostics for this buffer
      if vim.fn.exists ':lua require("lint")' == 2 then
        local lint = require 'lint'
        if lint then
          vim.diagnostic.reset(vim.api.nvim_create_namespace 'nvim-lint', 0)
        end
      end
    end
  end,
})
