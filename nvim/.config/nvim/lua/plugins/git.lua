return {
  {
    'lewis6991/gitsigns.nvim',
    event = { 'BufReadPre', 'BufNewFile' },
    keys = function()
      local git = require 'config.git'
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'gL', git.toggle_line_blame, 'Toggle line blame'),
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
      current_line_blame = true,
      current_line_blame_opts = {
        delay = 150,
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
        keys.lazy_leader('n', 'gd', git.open_dash, 'GitHub dash'),
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
            -- ['x'] = false,
            ['gb'] = git.open_branch_picker,
            ['gz'] = git.open_stash_popup,
            ['gZ'] = git.open_stash_list,
            ['gR'] = git.open_rebase_popup,
          },
        },
      }
    end,
    config = function(_, opts)
      require('neogit').setup(opts)
      -- Custom Neogit branch/preview logic (status branch section, busy-lock
      -- spinner, cursor-checkout, custom d/t/n/r keymaps, right-side preview)
      -- disabled: too unreliable. See config/neogit_branches.lua and
      -- config/neogit_preview.lua.
      -- require('config.neogit_branches').setup()

      -- When opening a file from the status view without a hunk-targeted
      -- cursor, Neogit hard-codes line 1. Fall back to the `"` mark instead,
      -- so unloaded files reopen at the last position recorded in shada.
      local jump = require 'neogit.lib.jump'
      local original_open = jump.open
      jump.open = function(command, path, cursor, cmd_debug_prefix)
        if cursor then
          return original_open(command, path, cursor, cmd_debug_prefix)
        end
        local logger = require 'neogit.logger'
        local cmd = ('silent! %s %s | silent! normal! g`"zz'):format(command, vim.fn.fnameescape(path))
        if cmd_debug_prefix then
          logger.debug(cmd_debug_prefix .. " '" .. cmd .. "'")
        end
        vim.cmd(cmd)
      end
    end,
  },
  {
    'kdheepak/lazygit.nvim',
    cmd = {
      'LazyGit',
      'LazyGitConfig',
      'LazyGitCurrentFile',
      'LazyGitFilter',
      'LazyGitFilterCurrentFile',
    },
    dependencies = {
      'nvim-lua/plenary.nvim',
    },
    keys = function()
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'gl', '<cmd>LazyGit<CR>', 'LazyGit'),
      }
    end,
  },
  {
    'sindrets/diffview.nvim',
    lazy = true,
  },
}
