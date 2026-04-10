return {
  {
    'folke/noice.nvim',
    event = 'VeryLazy',
    dependencies = {
      'MunifTanjim/nui.nvim',
    },
    opts = {
      cmdline = {
        enabled = false,
      },
      messages = {
        enabled = false,
      },
      popupmenu = {
        enabled = false,
      },
      notify = {
        enabled = false,
      },
      lsp = {
        progress = {
          enabled = false,
        },
        message = {
          enabled = false,
        },
        hover = {
          enabled = true,
          silent = true,
        },
        signature = {
          enabled = true,
        },
        override = {
          ['vim.lsp.util.convert_input_to_markdown_lines'] = true,
          ['vim.lsp.util.stylize_markdown'] = true,
          ['cmp.entry.get_documentation'] = false,
        },
      },
      views = {
        hover = {
          border = {
            style = 'rounded',
            padding = { 0, 1 },
          },
          scrollbar = false,
          win_options = {
            winblend = 0,
            winhighlight = {
              Normal = 'NormalFloat',
              FloatBorder = 'FloatBorder',
              FloatTitle = 'FloatTitle',
            },
          },
        },
      },
      presets = {
        bottom_search = false,
        command_palette = false,
        long_message_to_split = false,
        inc_rename = false,
        lsp_doc_border = true,
      },
    },
    config = function(_, opts)
      require('noice').setup(opts)
    end,
  },
}
