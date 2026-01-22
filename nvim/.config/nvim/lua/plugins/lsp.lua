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
          lspMux = {
            version = '1',
            method = 'connect',
            server = 'rust-analyzer',
          },
        },
      }

      local function rust_analyzer_root_dir()
        local path = vim.fn.getcwd()
        if not path then
          return nil
        end

        local ok, util = pcall(require, 'lspconfig.util')
        if not ok then
          return path
        end

        local root = util.root_pattern('rust-analyzer.json', 'Cargo.toml')(path) or util.find_git_ancestor(path)
        return root or path
      end

      local function load_project_rust_analyzer_settings()
        local default = vim.deepcopy(default_rust_analyzer_settings)
        local project_root = rust_analyzer_root_dir()
        if not project_root then
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

        return vim.tbl_deep_extend('force', default, overrides)
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
          cmd = vim.lsp.rpc.connect('127.0.0.1', 27631),
          root_dir = rust_analyzer_root_dir,
          settings = load_project_rust_analyzer_settings(),
        },
      }

      -- Ensure tools are installed
      local ensure_installed = {}
      for name, _ in pairs(servers or {}) do
        if name ~= 'rust_analyzer' then
          table.insert(ensure_installed, name)
        end
      end
      vim.list_extend(ensure_installed, {
        'stylua',
      })
      require('mason-tool-installer').setup { ensure_installed = ensure_installed }

      -- Setup LSP servers
      local mason_lspconfig = require 'mason-lspconfig'
      local lspconfig = require 'lspconfig.configs'

      local function setup_server(server_name, server)
        if not lspconfig[server_name] then
          local ok, config = pcall(require, 'lspconfig.configs.' .. server_name)
          if ok and config then
            lspconfig[server_name] = config
          end
        end
        if not lspconfig[server_name] then
          vim.notify(string.format('[lspconfig] config "%s" not found. Ensure it is listed in `configs.md`.', server_name), vim.log.levels.WARN)
          return
        end
        lspconfig[server_name].setup(server)
      end

      mason_lspconfig.setup {
        ensure_installed = {},
        automatic_installation = false,
        handlers = {
          function(server_name)
            local server = servers[server_name] or {}
            server.capabilities = vim.tbl_deep_extend('force', {}, capabilities, server.capabilities or {})
            setup_server(server_name, server)
          end,
        },
      }

      local installed = {}
      local ok_installed, installed_servers = pcall(mason_lspconfig.get_installed_servers)
      if ok_installed then
        for _, server_name in ipairs(installed_servers) do
          installed[server_name] = true
        end
      end

      for server_name, server in pairs(servers) do
        if not installed[server_name] then
          server.capabilities = vim.tbl_deep_extend('force', {}, capabilities, server.capabilities or {})
          setup_server(server_name, server)
        end
      end
    end,
  },
}
