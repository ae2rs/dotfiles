-- Neo-tree is a Neovim plugin to browse the file system
-- https://github.com/nvim-neo-tree/neo-tree.nvim

return {
  'nvim-neo-tree/neo-tree.nvim',
  version = '*',
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-tree/nvim-web-devicons', -- not strictly required, but recommended
    'MunifTanjim/nui.nvim',
  },
  lazy = false,
  keys = {
    { '\\', ':Neotree reveal<CR>', desc = 'NeoTree reveal', silent = true },
  },
  opts = {
    filesystem = {
      filtered_items = {
        visible = false,
        hide_dotfiles = false,
        hide_by_name = {
          'node_modules',
          '.git',
          '__pycache__',
        },
        always_show = { -- remains visible even if other settings would normally hide it
          '.gitignored',
        },
        always_show_by_pattern = { -- uses glob style patterns
          '.env*',
          '.config/*',
        },
      },
      window = {
        mappings = {
          ['\\'] = 'close_window',
          ['<esc>'] = 'close_window',
        },
      },
    },
    event_handlers = {
      {
        event = 'file_opened',
        handler = function(file_path)
          require('neo-tree.command').execute { action = 'close' }
        end,
      },
    },
    default_component_configs = {
      diagnostics = {
        symbols = {
          hint = '',
          info = '',
          warning = '',
          error = '',
        },
        highlights = {
          hint = 'DiagnosticSignHint',
          info = 'DiagnosticSignInfo',
          warn = 'DiagnosticSignWarn',
          error = 'DiagnosticSignError',
        },
      },
      name = {
        use_git_status_colors = true,
        highlight = 'NeoTreeFileName',
      },
      git_status = {
        symbols = {
          added = 'A', -- or "" or ""
          deleted = 'D', -- or "" or ""
          modified = 'M', -- or "" or ""
          renamed = 'R', -- or "" or "➜"
          untracked = 'U', -- or "" or ""
          ignored = '', -- or "" or ""
          unstaged = '', -- or "" or ""
          staged = '', -- or "" or ""
          conflict = 'X', -- or "" or ""
        },
        align = 'right',
      },
    },
  },
}
