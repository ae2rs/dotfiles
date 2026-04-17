return {
  {
    'folke/tokyonight.nvim',
    lazy = false,
    priority = 1000,
    config = function()
      require('tokyonight').setup {
        style = 'night',
        on_highlights = function(highlights, colors)
          highlights.CursorLine = {
            bg = colors.bg_highlight,
          }
          highlights.CursorLineNr = {
            fg = colors.orange,
            bold = true,
          }
        end,
      }
      vim.cmd.colorscheme 'tokyonight'
    end,
  },
}
