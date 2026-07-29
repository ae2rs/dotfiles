return {
  {
    'ibhagwan/fzf-lua',
    cmd = 'FzfLua',
    keys = function()
      local keys = require 'config.keys'
      local search = require 'config.search'

      return {
        keys.lazy_leader(
          'n',
          'sf',
          search.track('fzf', function()
            require('fzf-lua').files()
          end),
          'Search files'
        ),
        keys.lazy_leader(
          'n',
          'sg',
          search.track('fzf', function()
            require('fzf-lua').live_grep()
          end),
          'Search by grep'
        ),
      }
    end,
    dependencies = {
      'nvim-tree/nvim-web-devicons',
    },
    opts = function()
      local search = require 'config.search'

      local query_col

      -- Accept clippy-style `file.rs:line:col` (or `file.rs:line`) in the query:
      -- strip the suffix from the fzf search, open at the given position.
      local function line_col_query(q)
        if not q then
          return
        end
        query_col = nil
        local lnum, col = q:match ':(%d+):(%d+)$'
        if lnum then
          query_col = tonumber(col)
          return tonumber(lnum), (q:gsub(':%d+:%d+$', ''))
        end
        lnum = q:match ':(%d+)$'
        if lnum then
          return tonumber(lnum), (q:gsub(':%d+$', ''))
        end
      end

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
          cwd_prompt = false,
          line_query = line_col_query,
          actions = {
            ['default'] = function(selected, o)
              require('fzf-lua.actions').file_edit(selected, o)
              if query_col then
                pcall(vim.api.nvim_win_set_cursor, 0, { vim.fn.line '.', query_col - 1 })
                query_col = nil
              end
            end,
          },
          winopts = {
            height = 0.88,
            width = 0.92,
            preview = {
              hidden = false,
              layout = 'horizontal',
              horizontal = 'right:55%',
            },
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
