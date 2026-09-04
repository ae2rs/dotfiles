return {
  {
    'stevearc/conform.nvim',
    event = { 'BufWritePre' },
    cmd = { 'ConformInfo' },
    keys = function()
      local keys = require 'config.keys'

      local function format_buffer()
        require('conform').format {
          async = false,
          lsp_format = 'fallback',
        }
      end

      return {
        keys.lazy('n', '<leader>f', format_buffer, 'Format buffer'),
      }
    end,
    opts = {
      -- Mirrors dotfiles/format.sh, so editing a config here and running the
      -- repo's formatter never fight each other.
      formatters_by_ft = {
        lua = { 'stylua' },
        go = { 'goimports', 'gofumpt' },
        typescript = { 'prettier' },
        javascript = { 'prettier' },
        json = { 'prettier' },
        jsonc = { 'prettier' },
        yaml = { 'prettier' },
        markdown = { 'prettier' },
        python = { 'ruff_format' },
        sh = { 'shfmt' },
        bash = { 'shfmt' },
        toml = { 'taplo' },
      },
      format_on_save = function(bufnr)
        local bo = vim.bo[bufnr]
        if bo.buftype ~= '' then
          return nil
        end

        return {
          timeout_ms = 500,
          lsp_format = 'fallback',
        }
      end,
    },
  },
}
