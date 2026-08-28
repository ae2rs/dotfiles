local keys = require 'config.keys'

keys.leader_group('c', 'Code')
keys.leader_group('g', 'Git')
keys.leader_group('l', 'LSP')
keys.leader_group('s', 'Search')

keys.leader('n', 'sr', function()
  require('config.search').resume()
end, 'Resume last search')
keys.leader_group('t', 'Terminal')

keys.map('n', '<Esc>', '<cmd>nohlsearch<CR>', 'Clear search highlight')
keys.map('t', '<Esc><Esc>', '<C-\\><C-n>', 'Exit terminal mode')

-- Neovim's :terminal emits nothing at all for Alt+Backspace, and depending on
-- how the outer emulator encodes it nvim may also see it as two separate keys
-- (<Esc> then <BS>). Forward the canonical ESC+DEL sequence in both cases; zsh
-- binds ^[^? to backward-kill-word in zshrc.d/80-keybindings.zsh.
-- Alt+Left/Right need no mapping here: nvim already emits ^[[1;3D / ^[[1;3C,
-- which the same zsh file binds to backward-word / forward-word.
keys.map('t', '<M-BS>', '\27\127', 'Delete word backward')
keys.map('t', '<Esc><BS>', '\27\127', 'Delete word backward')

keys.map('n', '<C-h>', '<C-w><C-h>', 'Move focus left')
keys.map('n', '<C-j>', '<C-w><C-j>', 'Move focus down')
keys.map('n', '<C-k>', '<C-w><C-k>', 'Move focus up')
keys.map('n', '<C-l>', '<C-w><C-l>', 'Move focus right')

keys.leader('n', 'cp', function()
  local path = vim.fn.fnamemodify(vim.fn.expand '%', ':.')
  vim.fn.setreg('+', path)
  vim.notify('Copied: ' .. path)
end, 'Copy relative path')

keys.map('n', '[d', vim.diagnostic.goto_prev, 'Previous diagnostic')
keys.map('n', ']d', vim.diagnostic.goto_next, 'Next diagnostic')
keys.leader('n', 'ld', function()
  vim.diagnostic.open_float(nil, {
    border = 'rounded',
    scope = 'line',
    source = 'if_many',
  })
end, 'Line diagnostics')
