-- Git integration plugins

return {
  { -- Git signs in gutter
    'lewis6991/gitsigns.nvim',
    opts = {
      signs = {
        add = { text = '+' },
        change = { text = '~' },
        delete = { text = '_' },
        topdelete = { text = '‾' },
        changedelete = { text = '~' },
      },
    },
  },
  {
    'NeogitOrg/neogit',
    dependencies = {
      'nvim-lua/plenary.nvim',
      'sindrets/diffview.nvim',
      'nvim-telescope/telescope.nvim',
    },
    opts = { mappings = { status = { ['S'] = 'StageAll' } } },
    config = function()
      require('neogit').setup { mappings = { status = { ['S'] = 'StageAll' } } }
      local neogit = require 'neogit'
      vim.keymap.set('n', '<leader>gs', function()
        neogit.open()
      end, { desc = 'Open Neogit' })
      vim.keymap.set('n', '<leader>gv', function()
        neogit.open { kind = 'vsplit' }
      end, { desc = 'Open Neogit on split' })
    end,
  },
}
