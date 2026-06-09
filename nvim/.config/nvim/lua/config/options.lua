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
vim.o.cursorline = true
vim.o.cursorlineopt = 'number,line'
vim.o.guicursor = 'n-v-c:block,i-ci-ve:ver25,r-cr-o:hor20,a:blinkwait0-blinkoff0-blinkon0'

vim.schedule(function()
  vim.o.clipboard = 'unnamedplus'
end)
