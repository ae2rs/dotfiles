return {
  {
    'nvim-neo-tree/neo-tree.nvim',
    branch = 'v3.x',
    cmd = 'Neotree',
    keys = function()
      local keys = require 'config.keys'

      return {
        keys.lazy('n', '\\', '<Cmd>Neotree filesystem reveal left<CR>', 'Reveal file in explorer', {
          silent = true,
        }),
      }
    end,
    dependencies = {
      'nvim-lua/plenary.nvim',
      'MunifTanjim/nui.nvim',
      'nvim-tree/nvim-web-devicons',
    },
    opts = {
      filesystem = {
        filtered_items = {
          hide_dotfiles = false,
          hide_by_name = {
            '.git',
            'node_modules',
            '__pycache__',
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
          handler = function()
            require('neo-tree.command').execute { action = 'close' }
          end,
        },
      },
      default_component_configs = {
        name = {
          use_git_status_colors = true,
          highlight = 'NeoTreeFileName',
        },
        git_status = {
          symbols = {
            added = 'A',
            deleted = 'D',
            modified = 'M',
            renamed = 'R',
            untracked = 'U',
            ignored = '',
            unstaged = '',
            staged = '',
            conflict = 'X',
          },
          align = 'right',
        },
      },
    },
    config = function(_, opts)
      local group = vim.api.nvim_create_augroup('neo-tree-highlights', { clear = true })

      local function set_highlights()
        vim.api.nvim_set_hl(0, 'NeoTreeFileName', { link = 'Normal' })
      end

      require('neo-tree').setup(opts)
      set_highlights()

      vim.api.nvim_create_autocmd('ColorScheme', {
        group = group,
        callback = set_highlights,
      })
    end,
  },
}
