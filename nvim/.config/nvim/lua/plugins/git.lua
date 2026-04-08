return {
  {
    'NeogitOrg/neogit',
    cmd = 'Neogit',
    keys = function()
      local git = require 'config.git'
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'gg', git.open_status, 'Git status'),
        keys.lazy_leader('n', 'gz', git.open_stash_popup, 'Stash popup'),
        keys.lazy_leader('n', 'gZ', git.open_stash_list, 'Stash list'),
        keys.lazy_leader('n', 'gr', git.open_rebase_popup, 'Rebase popup'),
        keys.lazy_leader('n', 'gu', git.rebase_onto_upstream_or_base, 'Rebase onto upstream'),
        keys.lazy_leader('n', 'gR', git.open_reset_popup, 'Reset to commit'),
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
        integrations = {
          diffview = true,
          telescope = true,
        },
        telescope_sorter = function()
          return require('telescope').extensions.fzf.native_fzf_sorter()
        end,
        mappings = {
          status = {
            ['gz'] = git.open_stash_popup,
            ['gZ'] = git.open_stash_list,
            ['gr'] = git.open_rebase_popup,
            ['gR'] = git.open_reset_popup,
          },
        },
      }
    end,
    config = function(_, opts)
      require('neogit').setup(opts)
    end,
  },
  {
    'sindrets/diffview.nvim',
    lazy = true,
  },
}
