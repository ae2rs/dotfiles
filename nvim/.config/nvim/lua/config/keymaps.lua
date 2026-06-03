local keys = require 'config.keys'

keys.leader_group('c', 'Code')
keys.leader_group('g', 'Git')
keys.leader_group('l', 'LSP')
keys.leader_group('s', 'Search')
keys.leader_group('t', 'Terminal')

keys.map('n', '<Esc>', '<cmd>nohlsearch<CR>', 'Clear search highlight')
keys.map('t', '<Esc><Esc>', '<C-\\><C-n>', 'Exit terminal mode')

-- Translate Alt+<key> into single-byte readline equivalents that zsh's
-- vi-insert keymap understands. This avoids leaking a bare ESC into zsh,
-- which would otherwise drop the prompt into vi-cmd mode ("inverted prompt").
keys.map('t', '<M-BS>', '\23', 'Delete word backward (sends C-w)') -- ^W

keys.map('n', '<C-h>', '<C-w><C-h>', 'Move focus left')
keys.map('n', '<C-j>', '<C-w><C-j>', 'Move focus down')
keys.map('n', '<C-k>', '<C-w><C-k>', 'Move focus up')
keys.map('n', '<C-l>', '<C-w><C-l>', 'Move focus right')

keys.map('n', '[d', vim.diagnostic.goto_prev, 'Previous diagnostic')
keys.map('n', ']d', vim.diagnostic.goto_next, 'Next diagnostic')
keys.leader('n', 'ld', function()
  vim.diagnostic.open_float(nil, {
    border = 'rounded',
    scope = 'line',
    source = 'if_many',
  })
end, 'Line diagnostics')
