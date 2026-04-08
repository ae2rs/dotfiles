return {
  {
    'folke/lazydev.nvim',
    ft = 'lua',
    opts = {
      library = {
        { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
      },
    },
  },
  {
    'mason-org/mason.nvim',
    opts = {},
  },
  {
    'mason-org/mason-lspconfig.nvim',
    opts = {
      ensure_installed = { 'lua_ls' },
      automatic_enable = false,
    },
    dependencies = {
      { 'mason-org/mason.nvim', opts = {} },
      'neovim/nvim-lspconfig',
    },
  },
  {
    'neovim/nvim-lspconfig',
    config = function()
      local keys = require 'config.keys'

      vim.diagnostic.config {
        severity_sort = true,
        float = {
          border = 'rounded',
          source = 'if_many',
        },
      }

      vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('scratch-lsp-attach', { clear = true }),
        callback = function(event)
          local map = function(keys, func, desc, mode)
            mode = mode or 'n'
            vim.keymap.set(mode, keys, func, {
              buffer = event.buf,
              desc = desc,
            })
          end

          map('K', vim.lsp.buf.hover, 'LSP hover')
          map('gd', vim.lsp.buf.definition, 'Goto definition')
          map('gD', vim.lsp.buf.declaration, 'Goto declaration')
          map('gI', vim.lsp.buf.implementation, 'Goto implementation')
          map('grr', vim.lsp.buf.references, 'References')
          keys.leader('n', 'lr', vim.lsp.buf.rename, 'Rename symbol', { buffer = event.buf })
          keys.leader({ 'n', 'x' }, 'la', vim.lsp.buf.code_action, 'Code action', { buffer = event.buf })
        end,
      })

      vim.lsp.enable 'lua_ls'
    end,
  },
}
