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
      local action_layout = require 'telescope.actions.layout'
      local search = require 'config.search'
      local telescope = require 'telescope'
      local themes = require 'telescope.themes'

      local function apply_highlights()
        vim.api.nvim_set_hl(0, 'TelescopePromptPrefix', { fg = '#d79921' })
      end

      telescope.setup {
        defaults = {
          prompt_prefix = '  󰍉  ',
          sorting_strategy = 'ascending',
          dynamic_preview_title = true,
          vimgrep_arguments = search.vimgrep_arguments(),
          layout_strategy = 'horizontal',
          layout_config = {
            prompt_position = 'top',
            horizontal = {
              preview_width = 0.55,
            },
            width = 0.92,
            height = 0.88,
          },
          mappings = {
            i = {
              ['<C-h>'] = action_layout.toggle_preview,
            },
            n = {
              ['<C-h>'] = action_layout.toggle_preview,
            },
          },
        },
        pickers = {
          find_files = themes.get_dropdown {
            hidden = true,
            find_command = search.find_command(),
            previewer = false,
          },
          buffers = themes.get_dropdown {
            previewer = false,
            sort_mru = true,
            ignore_current_buffer = true,
            mappings = {
              i = {
                ['<C-d>'] = actions.delete_buffer,
              },
              n = {
                ['<C-d>'] = actions.delete_buffer,
              },
            },
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
      apply_highlights()

      vim.api.nvim_create_autocmd('ColorScheme', {
        callback = apply_highlights,
      })
    end,
  },
}
