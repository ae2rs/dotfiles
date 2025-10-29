-- Language-specific plugins

return {
  { -- Rust
    'lcsh0s/rustaceanvim',
    version = false,
    ft = { 'rust' },
    opts = {
      server = {
        load_vscode_settings = false,
        root_dir = function(fname)
          return require('lspconfig.util').root_pattern 'Cargo.toml'(fname)
            or require('lspconfig.util').root_pattern 'rust-analyzer.json'(fname)
            or vim.fs.dirname(vim.fs.find('.git', { path = fname, upward = true })[1])
        end,
        default_settings = {
          ['rust-analyzer'] = {
            cargo = {
              allFeatures = true,
              loadOutDirsFromCheck = true,
              buildScripts = {
                enable = true,
              },
            },
            checkOnSave = true,
            procMacro = {
              enable = true,
            },
          },
        },
      },
    },
    config = function(_, opts)
      vim.g.rustaceanvim = vim.tbl_deep_extend('keep', vim.g.rustaceanvim or {}, opts or {})
      if vim.fn.executable 'rust-analyzer' == 0 then
        LazyVim.error('**rust-analyzer** not found in PATH, please install it.\nhttps://rust-analyzer.github.io/', { title = 'rustaceanvim' })
      end
    end,
  },
}
