-- LSP Configuration

return {
  { -- Lua LSP configuration for Neovim
    'folke/lazydev.nvim',
    ft = 'lua',
    opts = {
      library = {
        { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
      },
    },
  },

  { -- Main LSP Configuration
    'neovim/nvim-lspconfig',
    dependencies = {
      { 'mason-org/mason.nvim', opts = {} },
      'mason-org/mason-lspconfig.nvim',
      'WhoIsSethDaniel/mason-tool-installer.nvim',
      'saghen/blink.cmp',
    },
    config = function()
      local notify = vim.notify
      vim.notify = function(msg, level, opts)
        local text = msg
        if type(msg) == 'table' and type(msg.message) == 'string' then
          text = msg.message
        end
        if type(text) == 'string' then
          local normalized = text:lower()
          if normalized:match 'overly%s+long%s+loop%s+turn%s+took' then
            return
          end
        end
        return notify(msg, level, opts)
      end

      local function suppress_overly_long(msg)
        if type(msg) ~= 'string' then
          return false
        end
        return msg:lower():match 'overly%s+long%s+loop%s+turn%s+took' ~= nil
      end

      local log_handler = vim.lsp.handlers['window/logMessage']
      vim.lsp.handlers['window/logMessage'] = function(err, result, ctx, config)
        if result and suppress_overly_long(result.message) then
          return
        end
        return log_handler(err, result, ctx, config)
      end

      local show_handler = vim.lsp.handlers['window/showMessage']
      vim.lsp.handlers['window/showMessage'] = function(err, result, ctx, config)
        if result and suppress_overly_long(result.message) then
          return
        end
        return show_handler(err, result, ctx, config)
      end

      local default_rust_analyzer_settings = {
        ['rust-analyzer'] = {
          diagnostics = {
            enable = false,
          },
          cargo = {
            allFeatures = true,
            loadOutDirsFromCheck = true,
            buildScripts = {
              enable = true,
            },
          },
          procMacro = {
            enable = true,
          },
        },
      }

      local function rust_analyzer_root_dir(fname)
        local ok, util = pcall(require, 'lspconfig.util')
        local path = fname
        if not path or path == '' then
          path = vim.fn.getcwd()
        end

        if not ok then
          return path
        end

        local root = util.root_pattern('rust-analyzer.json')(path)
        if root then
          return root
        end

        root = util.root_pattern('Cargo.toml')(path) or util.find_git_ancestor(path)
        if root then
          return root
        end

        return vim.fs.dirname(path) or path
      end

      local function load_project_rust_analyzer_settings(project_root)
        local default = vim.deepcopy(default_rust_analyzer_settings)
        if not project_root or project_root == '' then
          return default
        end

        local rust_analyzer_path = vim.fs.joinpath(project_root, 'rust-analyzer.json')
        if not vim.uv.fs_stat(rust_analyzer_path) then
          return default
        end

        local ok_read, lines = pcall(vim.fn.readfile, rust_analyzer_path)
        if not ok_read then
          return default
        end

        local ok_json, overrides = pcall(vim.json.decode, table.concat(lines, '\n'))
        if not ok_json or type(overrides) ~= 'table' then
          return default
        end

        local merged = vim.tbl_deep_extend('force', default, overrides)
        if merged['rust-analyzer'] then
          merged['rust-analyzer'].lspMux = nil
        end
        return merged
      end

      local function rust_analyzer_root_dir_cb(bufnr, on_dir)
        local fname = vim.api.nvim_buf_get_name(bufnr)
        if fname == '' then
          on_dir(nil)
          return
        end
        on_dir(rust_analyzer_root_dir(fname))
      end

      local MONOREPO_ROOT = '/Users/lucas/work/monorepo'
      local PROTOLS_INCLUDE_PATHS = {
        MONOREPO_ROOT .. '/rs',
        MONOREPO_ROOT .. '/rs/proto',
      }

      local function protols_root_dir(fname)
        local ok, util = pcall(require, 'lspconfig.util')
        if not ok then
          return vim.fn.getcwd()
        end
        local root = util.root_pattern('protols.toml', 'WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel', '.git')(fname)
        if root then
          return root
        end
        if fname and fname:match('^' .. MONOREPO_ROOT) then
          return MONOREPO_ROOT
        end
        return util.path.dirname(fname)
      end

      local function protols_cmd()
        local exe = vim.fn.exepath 'protols'
        if exe == '' then
          exe = vim.fs.joinpath(vim.fn.stdpath('data'), 'mason', 'bin', 'protols')
        end
        return { exe, '--include-paths=' .. table.concat(PROTOLS_INCLUDE_PATHS, ',') }
      end

      local function protols_root_dir_cb(bufnr, on_dir)
        local fname = vim.api.nvim_buf_get_name(bufnr)
        if fname == '' then
          on_dir(nil)
          return
        end
        on_dir(protols_root_dir(fname))
      end

      -- LSP attach autocommand
      vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
        callback = function(event)
          local map = function(keys, func, desc, mode)
            mode = mode or 'n'
            vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
          end

          -- LSP Keymaps
          map('grn', vim.lsp.buf.rename, '[R]e[n]ame')
          map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]ction', { 'n', 'x' })
          map('grr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
          map('gri', require('telescope.builtin').lsp_implementations, '[G]oto [I]mplementation')
          map('gd', require('telescope.builtin').lsp_definitions, '[G]oto [D]efinition')
          map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
          map('gO', require('telescope.builtin').lsp_document_symbols, 'Open Document Symbols')
          map('gW', require('telescope.builtin').lsp_dynamic_workspace_symbols, 'Open Workspace Symbols')
          map('gy', require('telescope.builtin').lsp_type_definitions, '[G]oto [T]ype Definition')

          -- Helper function for version compatibility
          local function client_supports_method(client, method, bufnr)
            if vim.fn.has 'nvim-0.11' == 1 then
              return client:supports_method(method, bufnr)
            else
              return client.supports_method(method, { bufnr = bufnr })
            end
          end

          -- Highlight references under cursor
          local client = vim.lsp.get_client_by_id(event.data.client_id)
          if client and client_supports_method(client, vim.lsp.protocol.Methods.textDocument_documentHighlight, event.buf) then
            local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
            vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.document_highlight,
            })

            vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.clear_references,
            })

            vim.api.nvim_create_autocmd('LspDetach', {
              group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
              callback = function(event2)
                vim.lsp.buf.clear_references()
                vim.api.nvim_clear_autocmds { group = 'kickstart-lsp-highlight', buffer = event2.buf }
              end,
            })
          end

          -- Inlay hints toggle
          if client and client_supports_method(client, vim.lsp.protocol.Methods.textDocument_inlayHint, event.buf) then
            map('<leader>th', function()
              vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf })
            end, '[T]oggle Inlay [H]ints')
          end
        end,
      })

      -- Diagnostic configuration
      vim.diagnostic.config {
        severity_sort = true,
        float = { border = 'rounded', source = 'if_many' },
        underline = { severity = vim.diagnostic.severity.ERROR },
        signs = vim.g.have_nerd_font and {
          text = {
            [vim.diagnostic.severity.ERROR] = '󰅚 ',
            [vim.diagnostic.severity.WARN] = '󰀪 ',
            [vim.diagnostic.severity.INFO] = '󰋽 ',
            [vim.diagnostic.severity.HINT] = '󰌶 ',
          },
        } or {},
        virtual_text = {
          source = 'if_many',
          spacing = 2,
          format = function(diagnostic)
            local diagnostic_message = {
              [vim.diagnostic.severity.ERROR] = diagnostic.message,
              [vim.diagnostic.severity.WARN] = diagnostic.message,
              [vim.diagnostic.severity.INFO] = diagnostic.message,
              [vim.diagnostic.severity.HINT] = diagnostic.message,
            }
            return diagnostic_message[diagnostic.severity]
          end,
        },
      }

      -- Get capabilities from blink.cmp
      local capabilities = require('blink.cmp').get_lsp_capabilities()

      -- Language servers
      local servers = {
        lua_ls = {
          settings = {
            Lua = {
              completion = {
                callSnippet = 'Replace',
              },
            },
          },
        },
        rust_analyzer = {
          root_dir = rust_analyzer_root_dir,
          settings = vim.deepcopy(default_rust_analyzer_settings),
          on_new_config = function(new_config, new_root_dir)
            new_config.settings = load_project_rust_analyzer_settings(new_root_dir)
          end,
        },
      }

      -- Ensure tools are installed
      local ensure_installed = {}
      for name, _ in pairs(servers or {}) do
        table.insert(ensure_installed, name)
      end
      vim.list_extend(ensure_installed, {
        'protols',
        'stylua',
      })
      require('mason-tool-installer').setup { ensure_installed = ensure_installed }

      -- Setup LSP servers
      local mason_lspconfig = require 'mason-lspconfig'
      local use_native_lsp = vim.fn.has 'nvim-0.11' == 1

      mason_lspconfig.setup {
        ensure_installed = {},
        automatic_installation = false,
        automatic_enable = {
          exclude = { 'rust_analyzer' },
        },
      }

      if use_native_lsp then
        vim.lsp.config('lua_ls', {
          capabilities = vim.tbl_deep_extend('force', {}, capabilities),
          settings = {
            Lua = {
              completion = {
                callSnippet = 'Replace',
              },
            },
          },
        })

        vim.lsp.config('rust_analyzer', {
          capabilities = vim.tbl_deep_extend('force', {}, capabilities),
          root_dir = rust_analyzer_root_dir_cb,
          settings = vim.deepcopy(default_rust_analyzer_settings),
          before_init = function(init_params, config)
            local merged = load_project_rust_analyzer_settings(config.root_dir)
            config.settings = config.settings or {}
            for key in pairs(config.settings) do
              config.settings[key] = nil
            end
            for key, value in pairs(merged) do
              config.settings[key] = value
            end
            init_params.initializationOptions = config.settings['rust-analyzer'] or {}
          end,
        })
        vim.lsp.enable 'rust_analyzer'
      else
        local lspconfig = require 'lspconfig'
        local lspconfigs = require 'lspconfig.configs'

        local function setup_server(server_name, server)
          if not lspconfig[server_name] then
            local ok, config = pcall(require, 'lspconfig.configs.' .. server_name)
            if ok and config then
              lspconfigs[server_name] = config
            end
          end
          if not lspconfig[server_name] then
            vim.notify(string.format('[lspconfig] config "%s" not found. Ensure it is listed in `configs.md`.', server_name), vim.log.levels.WARN)
            return
          end
          lspconfig[server_name].setup(server)
        end

        for server_name, server in pairs(servers) do
          server.capabilities = vim.tbl_deep_extend('force', {}, capabilities, server.capabilities or {})
          setup_server(server_name, server)
        end
      end

      -- Use the native 0.11 LSP config for protols to avoid lspconfig/Mason defaults
      -- (0.11 prefers vim.lsp.config; lspconfig may not affect the running client).
      if use_native_lsp then
        vim.lsp.config('protols', {
          cmd = protols_cmd(),
          filetypes = { 'proto' },
          root_dir = protols_root_dir_cb,
          init_options = {
            include_paths = PROTOLS_INCLUDE_PATHS,
          },
        })
        vim.lsp.enable 'protols'
      else
        local protols = {
          root_dir = protols_root_dir,
          filetypes = { 'proto' },
          cmd = protols_cmd(),
          before_init = function(_, config)
            config.init_options = config.init_options or {}
            config.init_options.include_paths = PROTOLS_INCLUDE_PATHS
          end,
        }
        protols.capabilities = vim.tbl_deep_extend('force', {}, capabilities, protols.capabilities or {})
        setup_server('protols', protols)
      end
    end,
  },
}
