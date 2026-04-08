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
          view = 'cmdline_popup',
          format = {
            cmdline = {
              view = 'cmdline_popup',
            },
            search_down = {
              view = 'cmdline_popup',
            },
            search_up = {
              view = 'cmdline_popup',
            },
            filter = false,
            lua = false,
            help = false,
            calculator = false,
            input = {
              view = 'cmdline_popup',
            },
          },
        },
        messages = {
          enabled = false,
        },
        notify = {
          enabled = false,
        },
        popupmenu = {
          enabled = false,
        },
        lsp = {
          progress = {
            enabled = true,
          },
          hover = {
            enabled = true,
          },
          signature = {
            enabled = true,
          },
          message = {
            enabled = true,
          },
        },
        presets = {
          bottom_search = false,
          command_palette = false,
          long_message_to_split = false,
          inc_rename = false,
          lsp_doc_border = false,
        },
        views = {
          mini = {
            position = {
              row = -2,
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

  { -- Render markdown in-buffer with nice formatting
    'MeanderingProgrammer/render-markdown.nvim',
    ft = { 'markdown', 'codecompanion' },
    dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.nvim' },
    opts = {},
    keys = {
      {
        '<leader>mp',
        function()
          vim.cmd 'tab split'
          vim.cmd 'RenderMarkdown enable'
        end,
        ft = 'markdown',
        desc = 'Markdown preview in new tab',
      },
    },
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
      statusline.setup {
        use_icons = vim.g.have_nerd_font,
        content = {
          active = function()
            local mode, mode_hl = statusline.section_mode { trunc_width = 120 }
            local git = statusline.section_git { trunc_width = 40 }
            local diagnostics = statusline.section_diagnostics { trunc_width = 75 }
            local lsp = statusline.section_lsp and statusline.section_lsp { trunc_width = 75 } or ''
            local filename = vim.fn.expand '%:.' ~= '' and vim.fn.expand '%:.' or '[No Name]'
            local filetype = vim.bo.filetype
            return statusline.combine_groups {
              { hl = mode_hl,                  strings = { mode } },
              { hl = 'MiniStatuslineDevinfo',  strings = { git, diagnostics, lsp } },
              '%<',
              { hl = 'MiniStatuslineFilename', strings = { filename } },
              '%=',
              { hl = 'MiniStatuslineFileinfo', strings = { filetype } },
              { hl = mode_hl,                  strings = { '%2l:%-2v' } },
            }
          end,
        },
      }
    end,
  },
}
