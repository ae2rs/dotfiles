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
    },
    config = function()
      local search = require 'config.search'
      local telescope = require 'telescope'

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
        },
      }

      pcall(telescope.load_extension, 'fzf')
    end,
  },
}
