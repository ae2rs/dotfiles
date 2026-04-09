return {
  {
    'ibhagwan/fzf-lua',
    cmd = 'FzfLua',
    keys = function()
      local keys = require 'config.keys'

      return {
        keys.lazy_leader('n', 'sf', function()
          require('fzf-lua').files()
        end, 'Search files'),
        keys.lazy_leader('n', 'sg', function()
          require('fzf-lua').live_grep()
        end, 'Search by grep'),
      }
    end,
    dependencies = {
      'nvim-tree/nvim-web-devicons',
    },
    opts = function()
      local search = require 'config.search'

      return {
        winopts = {
          backdrop = 100,
          border = 'rounded',
          height = 0.88,
          width = 0.92,
          preview = {
            hidden = true,
            layout = 'horizontal',
            horizontal = 'right:55%',
          },
        },
        fzf_opts = {
          ['--layout'] = 'reverse',
        },
        files = {
          prompt = '  󰍉  ',
          cmd = search.fzf_files_command(),
          multiprocess = true,
          previewer = false,
          cwd_prompt = false,
          winopts = {
            height = 0.45,
            width = 0.7,
          },
          fzf_opts = {
            ['--layout'] = 'reverse',
          },
        },
        grep = {
          prompt = '  󰍉  ',
          cmd = search.fzf_live_grep_command(),
          header = false,
          hidden = true,
          lgrep = true,
          cwd_prompt = false,
          fzf_opts = {
            ['--layout'] = 'reverse',
          },
        },
      }
    end,
  },
}
