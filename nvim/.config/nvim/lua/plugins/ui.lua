-- UI plugins: colorscheme, notifications, statusline, etc.

return {
  { -- Colorscheme
    'folke/tokyonight.nvim',
    priority = 1000,
    config = function()
      require('tokyonight').setup {
        styles = {
          comments = { italic = false },
        },
        on_highlights = function(highlights)
          highlights.NeoTreeGitModified = {
            fg = '#fab387', -- Orange/yellow for modified files
          }
          highlights.NeoTreeGitStaged = {
            fg = '#a6e3a1', -- Green for staged files
          }
          highlights.NeoTreeGitUntracked = {
            fg = '#9399b2', -- Grey for untracked files
          }
        end,
      }
      vim.cmd.colorscheme 'tokyonight-night'
    end,
  },

  { -- Better UI for messages, cmdline and popupmenu
    'folke/noice.nvim',
    event = 'VeryLazy',
    config = function()
      require('noice').setup {
        cmdline = {
          enabled = true,
        },
        messages = {
          enabled = true,
        },
        notify = {
          enabled = true,
        },
        popupmenu = {
          enabled = false,
        },
        lsp = {
          progress = {
            enabled = true,
          },
          hover = {
            enabled = false,
          },
          signature = {
            enabled = false,
          },
          message = {
            enabled = false,
          },
        },
        presets = {
          bottom_search = false,
          command_palette = false,
          long_message_to_split = true,
          inc_rename = false,
          lsp_doc_border = false,
        },
        views = {
          mini = {
            position = {
              row = -1,
            },
          },
        },
      }
    end,

    dependencies = {
      'MunifTanjim/nui.nvim',
      'rcarriga/nvim-notify',
    },
  },

  { -- Highlight todo, notes, etc in comments
    'folke/todo-comments.nvim',
    event = 'VimEnter',
    dependencies = { 'nvim-lua/plenary.nvim' },
    opts = { signs = false },
  },

  { -- Collection of various small independent plugins/modules
    'echasnovski/mini.nvim',
    config = function()
      -- Better Around/Inside textobjects
      require('mini.ai').setup { n_lines = 500 }

      -- Add/delete/replace surroundings (brackets, quotes, etc.)
      require('mini.surround').setup()

      -- Simple and easy statusline
      local statusline = require 'mini.statusline'
      statusline.setup { use_icons = vim.g.have_nerd_font }

      -- Configure cursor location section
      statusline.section_location = function()
        return '%2l:%-2v'
      end
    end,
  },
}
