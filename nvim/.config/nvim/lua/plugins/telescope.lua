return {
  {
    'nvim-telescope/telescope.nvim',
    cmd = 'Telescope',
    keys = function()
      local keys = require 'config.keys'
      local builtin = require 'telescope.builtin'

      return {
        keys.lazy_leader('n', 'sf', builtin.find_files, 'Search files'),
        keys.lazy_leader('n', 'sg', builtin.live_grep, 'Search by grep'),
        keys.lazy_leader('n', 's.', builtin.oldfiles, 'Search recent files'),
        keys.lazy_leader('n', '<leader>', builtin.buffers, 'Search buffers'),
        keys.lazy_leader('n', 'sd', builtin.diagnostics, 'Search diagnostics'),
      }
    end,
    dependencies = {
      'nvim-lua/plenary.nvim',
      {
        'nvim-telescope/telescope-fzf-native.nvim',
        build = 'make',
      },
      'nvim-telescope/telescope-ui-select.nvim',
    },
    config = function()
      local actions = require 'telescope.actions'
      local search = require 'config.search'
      local telescope = require 'telescope'
      local themes = require 'telescope.themes'

      telescope.setup {
        defaults = {
          vimgrep_arguments = search.vimgrep_arguments(),
          mappings = {
            i = {
              ['<C-u>'] = false,
              ['<C-d>'] = false,
            },
          },
        },
        pickers = {
          find_files = {
            hidden = true,
            find_command = search.find_command(),
          },
        },
        extensions = {
          fzf = {
            fuzzy = true,
            override_generic_sorter = true,
            override_file_sorter = true,
            case_mode = 'smart_case',
          },
          ['ui-select'] = themes.get_dropdown {
            initial_mode = 'normal',
            previewer = false,
            mappings = {
              i = {
                ['<Esc>'] = actions.close,
              },
              n = {
                ['<Esc>'] = actions.close,
                ['q'] = actions.close,
              },
            },
          },
        },
      }

      pcall(telescope.load_extension, 'fzf')
      pcall(telescope.load_extension, 'ui-select')
    end,
  },
}
