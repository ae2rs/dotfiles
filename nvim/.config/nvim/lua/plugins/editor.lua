-- Editor plugins: fzf-lua, which-key, neo-tree, treesitter, etc.

return {
  'NMAC427/guess-indent.nvim', -- Detect tabstop and shiftwidth automatically

  { -- Useful plugin to show pending keybinds
    'folke/which-key.nvim',
    event = 'VimEnter',
    opts = {
      delay = 0,
      icons = {
        mappings = vim.g.have_nerd_font,
        keys = vim.g.have_nerd_font and {} or {
          Up = '<Up> ',
          Down = '<Down> ',
          Left = '<Left> ',
          Right = '<Right> ',
          C = '<C-…> ',
          M = '<M-…> ',
          D = '<D-…> ',
          S = '<S-…> ',
          CR = '<CR> ',
          Esc = '<Esc> ',
          ScrollWheelDown = '<ScrollWheelDown> ',
          ScrollWheelUp = '<ScrollWheelUp> ',
          NL = '<NL> ',
          BS = '<BS> ',
          Space = '<Space> ',
          Tab = '<Tab> ',
          F1 = '<F1>',
          F2 = '<F2>',
          F3 = '<F3>',
          F4 = '<F4>',
          F5 = '<F5>',
          F6 = '<F6>',
          F7 = '<F7>',
          F8 = '<F8>',
          F9 = '<F9>',
          F10 = '<F10>',
          F11 = '<F11>',
          F12 = '<F12>',
        },
      },
      spec = {
        { '<leader>s', group = '[S]earch' },
        { '<leader>t', group = '[T]oggle' },
        { '<leader>h', group = 'Git [H]unk', mode = { 'n', 'v' } },
      },
    },
  },

  -- Telescope (disabled in favor of fzf-lua)
  -- {
  --   'nvim-telescope/telescope.nvim',
  --   event = 'VimEnter',
  --   dependencies = {
  --     'nvim-lua/plenary.nvim',
  --     {
  --       'nvim-telescope/telescope-fzf-native.nvim',
  --       build = 'make',
  --       cond = function()
  --         return vim.fn.executable 'make' == 1
  --       end,
  --     },
  --     { 'nvim-telescope/telescope-ui-select.nvim' },
  --     { 'nvim-tree/nvim-web-devicons', enabled = vim.g.have_nerd_font },
  --   },
  --   config = function()
  --     require('telescope').setup {
  --       pickers = {
  --         live_grep = {
  --           file_ignore_patterns = { 'node_modules', '.git', '.venv' },
  --           additional_args = function(_)
  --             return { '--hidden' }
  --           end,
  --         },
  --         find_files = {
  --           file_ignore_patterns = { 'node_modules', '.git', '.venv', 'target' },
  --           hidden = true,
  --         },
  --       },
  --       extensions = {
  --         ['ui-select'] = {
  --           require('telescope.themes').get_dropdown(),
  --         },
  --       },
  --     }
  --
  --     if vim.g.vscode then
  --       vim.keymap.set('n', '<leader>sf', "<cmd>lua require('vscode').action('workbench.action.quickOpen')<CR>", { desc = '[S]earch [F]ile' })
  --       vim.keymap.set('n', '<leader>sg', "<cmd>lua require('vscode').action('workbench.action.findInFiles')<CR>", { desc = '[S]earch by [G]rep' })
  --       vim.keymap.set('n', '<leader>e', "<cmd>lua require('vscode').action('workbench.view.explorer')<CR>", { desc = 'File Explorer' })
  --     else
  --       -- Enable extensions
  --       pcall(require('telescope').load_extension, 'fzf')
  --       pcall(require('telescope').load_extension, 'ui-select')
  --
  --       -- Keymaps
  --       local builtin = require 'telescope.builtin'
  --       vim.keymap.set('n', '<leader>sh', builtin.help_tags, { desc = '[S]earch [H]elp' })
  --       vim.keymap.set('n', '<leader>sk', builtin.keymaps, { desc = '[S]earch [K]eymaps' })
  --       vim.keymap.set('n', '<leader>sf', builtin.find_files, { desc = '[S]earch [F]iles' })
  --       vim.keymap.set('n', '<leader>ss', builtin.builtin, { desc = '[S]earch [S]elect Telescope' })
  --       vim.keymap.set('n', '<leader>sw', builtin.grep_string, { desc = '[S]earch current [W]ord' })
  --       vim.keymap.set('n', '<leader>sg', builtin.live_grep, { desc = '[S]earch by [G]rep' })
  --       vim.keymap.set('n', '<leader>sd', builtin.diagnostics, { desc = '[S]earch [D]iagnostics' })
  --       vim.keymap.set('n', '<leader>sr', builtin.resume, { desc = '[S]earch [R]esume' })
  --       vim.keymap.set('n', '<leader>s.', builtin.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
  --       vim.keymap.set('n', '<leader><leader>', builtin.buffers, { desc = '[ ] Find existing buffers' })
  --
  --       vim.keymap.set('n', '<leader>/', function()
  --         builtin.current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
  --           winblend = 10,
  --           previewer = true,
  --         })
  --       end, { desc = '[/] Fuzzily search in current buffer' })
  --
  --       vim.keymap.set('n', '<leader>s/', function()
  --         builtin.live_grep {
  --           grep_open_files = true,
  --           prompt_title = 'Live Grep in Open Files',
  --         }
  --       end, { desc = '[S]earch [/] in Open Files' })
  --
  --       vim.keymap.set('n', '<leader>sn', function()
  --         builtin.find_files { cwd = vim.fn.stdpath 'config' }
  --       end, { desc = '[S]earch [N]eovim files' })
  --     end
  --   end,
  -- },
  {
    'ibhagwan/fzf-lua',
    -- optional for icon support
    dependencies = { 'nvim-tree/nvim-web-devicons' },
    -- or if using mini.icons/mini.nvim
    -- dependencies = { "nvim-mini/mini.icons" },
    ---@module "fzf-lua"
    ---@type fzf-lua.Config|{}
    ---@diagnostic disable: missing-fields
    opts = {
      'telescope',
      files = {
        rg_opts = [[--color=never --hidden --files -g "!.git" -g "!**/node_modules/*" -g "!**/.venv/*" -g "!**/target/*"]],
        fd_opts = [[--color=never --hidden --type f --type l --exclude .git --exclude node_modules --exclude .venv --exclude target]],
        hidden = true,
      },
      grep = {
        rg_opts = [[--column --line-number --no-heading --color=always --smart-case --hidden --glob "!**/.git/*" --glob "!**/node_modules/*" --glob "!**/.venv/*" --glob "!**/target/*" --max-columns=4096 -e]],
        hidden = true,
        actions = {
          ['ctrl-g'] = false,
        },
      },
      live_grep = {
        actions = {
          ['ctrl-g'] = false,
        },
      },
    },
    ---@diagnostic enable: missing-fields
    config = function(_, opts)
      local fzf = require 'fzf-lua'
      fzf.setup(opts)

      if vim.g.vscode then
        vim.keymap.set('n', '<leader>sf', "<cmd>lua require('vscode').action('workbench.action.quickOpen')<CR>", { desc = '[S]earch [F]ile' })
        vim.keymap.set('n', '<leader>sg', "<cmd>lua require('vscode').action('workbench.action.findInFiles')<CR>", { desc = '[S]earch by [G]rep' })
        vim.keymap.set('n', '<leader>e', "<cmd>lua require('vscode').action('workbench.view.explorer')<CR>", { desc = 'File Explorer' })
        return
      end

      vim.keymap.set('n', '<leader>sh', fzf.helptags, { desc = '[S]earch [H]elp' })
      vim.keymap.set('n', '<leader>sk', fzf.keymaps, { desc = '[S]earch [K]eymaps' })
      vim.keymap.set('n', '<leader>sf', fzf.files, { desc = '[S]earch [F]iles' })
      vim.keymap.set('n', '<leader>sF', function()
        local clip = vim.trim(vim.fn.getreg '+')
        local file, line, col = clip:match '^(.+):(%d+):(%d+)$'
        if not file then
          file, line = clip:match '^(.+):(%d+)$'
        end
        if not file then
          file = clip
        end
        line = line and tonumber(line)
        col = col and tonumber(col)
        local function jump_after_open(selected)
          if selected and selected[1] then
            vim.cmd('edit ' .. vim.fn.fnameescape(selected[1]))
            if line then
              vim.schedule(function()
                pcall(vim.api.nvim_win_set_cursor, 0, { line, (col or 1) - 1 })
              end)
            end
          end
        end
        if vim.fn.filereadable(file) == 1 then
          jump_after_open { file }
        else
          fzf.files { query = file, actions = { ['default'] = jump_after_open } }
        end
      end, { desc = '[S]earch [F]ile at location (file:line:col from clipboard)' })
      vim.keymap.set('n', '<leader>ss', fzf.builtin, { desc = '[S]earch [S]elect FzfLua' })
      vim.keymap.set('n', '<leader>sw', fzf.grep_cword, { desc = '[S]earch current [W]ord' })
      vim.keymap.set('n', '<leader>sg', fzf.live_grep, { desc = '[S]earch by [G]rep' })
      vim.keymap.set('n', '<leader>sd', fzf.diagnostics_workspace, { desc = '[S]earch [D]iagnostics' })
      vim.keymap.set('n', '<leader>sr', fzf.resume, { desc = '[S]earch [R]esume' })
      vim.keymap.set('n', '<leader>s.', fzf.oldfiles, { desc = '[S]earch Recent Files ("." for repeat)' })
      vim.keymap.set('n', '<leader><leader>', fzf.buffers, { desc = '[ ] Find existing buffers' })

      vim.keymap.set('n', '<leader>/', fzf.blines, { desc = '[/] Fuzzily search in current buffer' })
      vim.keymap.set('n', '<leader>s/', fzf.lines, { desc = '[S]earch [/] in Open Files' })

      vim.keymap.set('n', '<leader>sn', function()
        fzf.files { cwd = vim.fn.stdpath 'config' }
      end, { desc = '[S]earch [N]eovim files' })
    end,
  },
  { -- Highlight, edit, and navigate code
    'nvim-treesitter/nvim-treesitter',
    build = ':TSUpdate',
    main = 'nvim-treesitter.configs',
    opts = {
      ensure_installed = { 'bash', 'c', 'diff', 'html', 'lua', 'luadoc', 'markdown', 'markdown_inline', 'query', 'vim', 'vimdoc' },
      auto_install = true,
      highlight = {
        enable = true,
        additional_vim_regex_highlighting = { 'ruby' },
      },
      indent = { enable = true, disable = { 'ruby' } },
    },
  },
}
