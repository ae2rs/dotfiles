return {
  {
    'folke/lazydev.nvim',
    ft = 'lua',
    opts = {
      library = {
        { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
      },
    },
  },
  {
    'mason-org/mason.nvim',
    opts = {},
  },
  {
    'mason-org/mason-lspconfig.nvim',
    opts = {
      ensure_installed = { 'lua_ls', 'rust_analyzer', 'protols' },
      automatic_enable = false,
    },
    dependencies = {
      { 'mason-org/mason.nvim', opts = {} },
      'neovim/nvim-lspconfig',
    },
  },
  {
    'neovim/nvim-lspconfig',
    config = function()
      local keys = require 'config.keys'
      local monorepo = require 'lsp.monorepo'
      local lsp = vim.lsp
      local protocol = lsp.protocol
      local protols = require 'lsp.protols'
      local rust_analyzer = require 'lsp.rust_analyzer'
      local util = require 'vim.lsp.util'

      local function save_modified_file_buffers()
        for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
          if vim.api.nvim_buf_is_loaded(bufnr) then
            local name = vim.api.nvim_buf_get_name(bufnr)
            local bo = vim.bo[bufnr]
            if name ~= '' and bo.buftype == '' and bo.modifiable and bo.modified then
              pcall(vim.api.nvim_buf_call, bufnr, function()
                vim.cmd 'silent keepalt update'
              end)
            end
          end
        end
      end

      local function rename_symbol(opts)
        opts = opts or {}
        local bufnr = opts.bufnr or vim.api.nvim_get_current_buf()
        local win = vim.api.nvim_get_current_win()
        local current_name = vim.fn.expand '<cword>'
        local clients = lsp.get_clients {
          bufnr = bufnr,
          method = protocol.Methods.textDocument_rename,
        }

        if #clients == 0 then
          vim.notify '[LSP] Rename, no matching language servers with rename capability.'
          return
        end

        vim.ui.input({
          prompt = 'New Name: ',
          default = current_name,
        }, function(input)
          if not input or input == '' or input == current_name then
            return
          end

          lsp.buf_request_all(bufnr, protocol.Methods.textDocument_rename, function(client)
            local params = util.make_position_params(win, client.offset_encoding)
            params.newName = input
            return params
          end, function(results)
            local applied_edit = false

            for client_id, response in pairs(results) do
              if response.err then
                lsp.log.error(response.err.code, response.err.message)
              elseif response.result then
                local client = lsp.get_client_by_id(client_id)
                if client then
                  util.apply_workspace_edit(response.result, client.offset_encoding)
                  applied_edit = true
                end
              end
            end

            if applied_edit then
              save_modified_file_buffers()
            else
              vim.notify("Language server couldn't provide rename result", vim.log.levels.INFO)
            end
          end)
        end)
      end

      vim.diagnostic.config {
        severity_sort = true,
        virtual_text = false,
        virtual_lines = false,
        float = {
          border = 'rounded',
          source = 'if_many',
        },
      }

      monorepo.setup_message_filters()

      vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('scratch-lsp-attach', { clear = true }),
        callback = function(event)
          local function telescope_picker(method)
            return function()
              require('telescope.builtin')[method]()
            end
          end

          local map = function(keys, func, desc, mode)
            mode = mode or 'n'
            vim.keymap.set(mode, keys, func, {
              buffer = event.buf,
              desc = desc,
            })
          end

          map('gd', telescope_picker 'lsp_definitions', 'Goto definition')
          map('gD', lsp.buf.declaration, 'Goto declaration')
          map('gh', lsp.buf.hover, 'Hover')
          map('gri', telescope_picker 'lsp_implementations', 'Goto implementation')
          map('grn', function()
            rename_symbol { bufnr = event.buf }
          end, 'Rename symbol')
          map('grr', telescope_picker 'lsp_references', 'Goto references')
          map('gO', telescope_picker 'lsp_document_symbols', 'Document symbols')
          map('gW', telescope_picker 'lsp_dynamic_workspace_symbols', 'Workspace symbols')
          map('gy', telescope_picker 'lsp_type_definitions', 'Goto type definition')
          map('K', lsp.buf.hover, 'Hover')
          keys.leader({ 'n', 'x' }, 'la', lsp.buf.code_action, 'Code action', { buffer = event.buf })
        end,
      })

      lsp.config('lua_ls', require 'lsp.lua_ls')
      lsp.config('monorepo_rust_analyzer', rust_analyzer)
      lsp.config('protols', protols)

      lsp.enable 'lua_ls'
      lsp.enable 'monorepo_rust_analyzer'
      lsp.enable 'protols'
    end,
  },
}
