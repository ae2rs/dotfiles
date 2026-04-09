return {
  {
    'saghen/blink.cmp',
    version = '1.*',
    dependencies = {
      'rafamadriz/friendly-snippets',
    },
    ---@module 'blink.cmp'
    ---@type blink.cmp.Config
    opts = {
      keymap = {
        preset = 'none',
        ['<C-space>'] = { 'show', 'show_documentation', 'hide_documentation' },
        ['<C-e>'] = { 'hide', 'fallback' },
        ['<C-y>'] = { 'select_and_accept', 'fallback' },
        ['<C-p>'] = { 'select_prev', 'fallback_to_mappings' },
        ['<C-n>'] = { 'select_next', 'fallback_to_mappings' },
      },
      appearance = {
        nerd_font_variant = 'mono',
      },
      completion = {
        menu = {
          auto_show = true,
        },
        documentation = {
          auto_show = false,
        },
      },
      sources = {
        default = { 'lsp', 'path', 'snippets', 'buffer' },
      },
    },
  },
  {
    'Exafunction/windsurf.nvim',
    main = 'codeium',
    cmd = 'Codeium',
    event = 'InsertEnter',
    dependencies = {
      'nvim-lua/plenary.nvim',
    },
    keys = function()
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'ca', '<cmd>Codeium Auth<CR>', 'Windsurf auth'),
        keys.lazy_leader('n', 'ct', '<cmd>Codeium Toggle<CR>', 'Toggle Windsurf'),
      }
    end,
    opts = {
      enable_chat = false,
      enable_cmp_source = false,
      virtual_text = {
        enabled = true,
        filetypes = {
          TelescopePrompt = false,
        },
      },
    },
  },
}
