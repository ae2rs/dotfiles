vim.api.nvim_create_autocmd('TextYankPost', {
  group = vim.api.nvim_create_augroup('scratch-highlight-yank', { clear = true }),
  callback = function()
    vim.hl.on_yank()
  end,
})
