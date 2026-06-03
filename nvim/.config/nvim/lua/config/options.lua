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

-- Enable project-local config (.nvim.lua) only when launched from the monorepo.
-- Neovim still prompts to trust the file the first time it loads (`:help trust`).
if vim.startswith(vim.fn.getcwd(), '/Users/lucas/work/monorepo') then
  vim.o.exrc = true
end

vim.schedule(function()
  vim.o.clipboard = 'unnamedplus'
end)
