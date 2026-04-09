return {
  {
    'lewis6991/gitsigns.nvim',
    event = { 'BufReadPre', 'BufNewFile' },
    keys = function()
      local git = require 'config.git'
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'gl', git.toggle_line_blame, 'Toggle line blame'),
      }
    end,
    opts = {
      signs = {
        add = { text = '+' },
        change = { text = '~' },
        delete = { text = '_' },
        topdelete = { text = '^' },
        changedelete = { text = '~' },
        untracked = { text = '?' },
      },
      signcolumn = true,
      current_line_blame = false,
      current_line_blame_opts = {
        delay = 0,
        virt_text_pos = 'eol',
      },
      current_line_blame_formatter = '<author>, <author_time:%Y-%m-%d> - <summary>',
    },
  },
  {
    'NeogitOrg/neogit',
    cmd = 'Neogit',
    keys = function()
      local git = require 'config.git'
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'gg', git.open_status, 'Git status'),
        keys.lazy_leader('n', 'gb', git.open_branch_picker, 'Git branches'),
        keys.lazy_leader('n', 'gr', git.open_reset_picker, 'Reset from commits'),
        keys.lazy_leader('n', 'gz', git.open_stash_popup, 'Stash popup'),
        keys.lazy_leader('n', 'gZ', git.open_stash_list, 'Stash list'),
        keys.lazy_leader('n', 'gR', git.open_rebase_popup, 'Rebase popup'),
      }
    end,
    dependencies = {
      'nvim-lua/plenary.nvim',
      'nvim-telescope/telescope.nvim',
      'sindrets/diffview.nvim',
    },
    opts = function()
      local git = require 'config.git'

      return {
        floating = {
          width = 0.72,
          height = 0.32,
          border = 'rounded',
        },
        commit_editor = {
          kind = 'floating',
        },
        integrations = {
          diffview = true,
          telescope = true,
        },
        telescope_sorter = function()
          return require('telescope').extensions.fzf.native_fzf_sorter()
        end,
        mappings = {
          status = {
            ['gb'] = git.open_branch_picker,
            ['gr'] = git.open_reset_picker,
            ['gz'] = git.open_stash_popup,
            ['gZ'] = git.open_stash_list,
            ['gR'] = git.open_rebase_popup,
          },
        },
      }
    end,
    config = function(_, opts)
      local group = vim.api.nvim_create_augroup('neogit-highlights', { clear = true })

      local function set_neogit_highlights()
        local colors = require('tokyonight.colors').setup { style = 'storm' }
        local highlights = {
          NeogitHunkHeaderCursor = { bg = 'NONE', fg = colors.blue, bold = true },
          NeogitDiffContextCursor = { bg = 'NONE', fg = colors.fg_dark },
          NeogitDiffAddCursor = { bg = 'NONE', fg = colors.git.add, bold = true },
          NeogitDiffDeleteCursor = { bg = 'NONE', fg = colors.git.delete, bold = true },
          NeogitDiffAddInline = { bg = 'NONE', fg = colors.git.add, italic = true },
          NeogitDiffDeleteInline = { bg = 'NONE', fg = colors.git.delete, italic = true },
        }

        for name, spec in pairs(highlights) do
          vim.api.nvim_set_hl(0, name, spec)
        end
      end

      require('neogit').setup(opts)
      set_neogit_highlights()

      vim.api.nvim_create_autocmd('ColorScheme', {
        group = group,
        callback = set_neogit_highlights,
      })

      vim.api.nvim_create_autocmd('User', {
        group = group,
        pattern = { 'NeogitStatusRefreshed', 'NeogitDiffLoaded' },
        callback = set_neogit_highlights,
      })
    end,
  },
  {
    'sindrets/diffview.nvim',
    lazy = true,
  },
}
