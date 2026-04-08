return {
  {
    'stevearc/conform.nvim',
    event = { 'BufWritePre' },
    cmd = { 'ConformInfo' },
    keys = {
      {
        '<leader>f',
        function()
          require('conform').format { async = true, lsp_format = 'fallback' }
        end,
        desc = 'Format buffer',
      },
    },
    opts = {
      formatters_by_ft = {
        lua = { 'stylua' },
      },
      format_on_save = function(bufnr)
        if vim.bo[bufnr].filetype ~= 'lua' then
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
