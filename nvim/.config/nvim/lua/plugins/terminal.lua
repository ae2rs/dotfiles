return {
  {
    'akinsho/toggleterm.nvim',
    version = '*',
    cmd = { 'ToggleTerm', 'TermExec', 'ToggleTermToggleAll' },
    keys = function()
      local keys = require 'config.keys'

      return {
        keys.lazy({ 'n', 't' }, '<C-/>', '<cmd>ToggleTerm direction=float<CR>', 'Toggle floating terminal'),
        keys.lazy_leader('n', 'tt', '<cmd>ToggleTerm<CR>', 'Toggle terminal'),
        keys.lazy_leader('n', 'tf', '<cmd>ToggleTerm direction=float<CR>', 'Floating terminal'),
        keys.lazy_leader('n', 'th', '<cmd>ToggleTerm direction=horizontal<CR>', 'Horizontal terminal'),
        keys.lazy_leader('n', 'tv', '<cmd>ToggleTerm direction=vertical<CR>', 'Vertical terminal'),
        keys.lazy_leader('n', 'tA', '<cmd>ToggleTermToggleAll<CR>', 'Toggle all terminals'),
      }
    end,
    opts = {
      size = function(term)
        if term.direction == 'horizontal' then
          return 15
        elseif term.direction == 'vertical' then
          return math.floor(vim.o.columns * 0.4)
        end
      end,
      shade_terminals = true,
      start_in_insert = true,
      persist_size = true,
      persist_mode = true,
      direction = 'float',
      close_on_exit = true,
      float_opts = {
        border = 'rounded',
        winblend = 0,
      },
    },
  },
}
