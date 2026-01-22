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
  {
    'johnseth97/gh-dash.nvim',
    lazy = true,
    keys = {
      {
        '<leader>gd',
        function()
          require('gh_dash').toggle()
          vim.schedule(function()
            vim.cmd 'startinsert'
          end)
        end,
        desc = 'Toggle gh-dash popup',
      },
    },
    opts = {
      keymaps = {},
      border = 'rounded',
      width = 0.8,
      height = 0.8,
      autoinstall = true,
    },
  },
  {
    'kdheepak/lazygit.nvim',
    lazy = true,
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
    keys = {
      { '<leader>gl', '<cmd>LazyGit<cr>', desc = 'LazyGit' },
    },
  },
  {
    'f-person/git-blame.nvim',
    -- load the plugin at startup
    event = 'VeryLazy',
    opts = {
      enabled = true,
      message_template = ' <summary> • <date> • <author> • <<sha>>',
      date_format = '%m-%d-%Y %H:%M:%S',
      virtual_text_column = 1,
      highlight_group = 'Comment',
      delay = 250,
      set_extmark_options = {
        hl_mode = 'combine',
        priority = 100,
      },
    },
  },
  {
    'pwntester/octo.nvim',
    cmd = 'Octo',
    opts = {
      picker = 'telescope',
      -- bare Octo command opens picker of commands
      enable_builtin = true,
    },
    keys = {
      {
        '<leader>oi',
        '<CMD>Octo issue list<CR>',
        desc = 'List GitHub Issues',
      },
      {
        '<leader>op',
        '<CMD>Octo pr list<CR>',
        desc = 'List GitHub PullRequests',
      },
      {
        '<leader>od',
        '<CMD>Octo discussion list<CR>',
        desc = 'List GitHub Discussions',
      },
      {
        '<leader>on',
        '<CMD>Octo notification list<CR>',
        desc = 'List GitHub Notifications',
      },
      {
        '<leader>os',
        function()
          require('octo.utils').create_base_search_command { include_current_repo = true }
        end,
        desc = 'Search GitHub',
      },
    },
    dependencies = {
      'nvim-lua/plenary.nvim',
      'nvim-telescope/telescope.nvim',
      'nvim-tree/nvim-web-devicons',
    },
  },
}
