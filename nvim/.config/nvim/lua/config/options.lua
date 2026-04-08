vim.o.number = true
vim.o.relativenumber = true
vim.o.mouse = 'a'
vim.o.signcolumn = 'yes'
vim.o.ignorecase = true
vim.o.smartcase = true
vim.o.splitright = true
vim.o.splitbelow = true
vim.o.termguicolors = true
vim.o.updatetime = 250
vim.o.timeoutlen = 300

vim.schedule(function()
  vim.o.clipboard = 'unnamedplus'
end)
