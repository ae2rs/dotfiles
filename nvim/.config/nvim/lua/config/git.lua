local M = {}

local function repo_root()
  local git = require 'neogit.lib.git'
  local cwd = git.cli.worktree_root '.'

  if cwd == '' then
    return vim.uv.cwd()
  end

  return cwd
end

local function telescope_git_picker(name, opts)
  opts = opts and vim.deepcopy(opts) or {}
  opts.cwd = opts.cwd or repo_root()
  require('telescope.builtin')[name](opts)
end

local function dash_tab_is_dedicated(tabpage, bufnr)
  if not vim.api.nvim_tabpage_is_valid(tabpage) then
    return false
  end

  local wins = vim.api.nvim_tabpage_list_wins(tabpage)
  if #wins ~= 1 then
    return false
  end

  return vim.api.nvim_win_get_buf(wins[1]) == bufnr
end

local function close_tabpage(tabpage)
  if not vim.api.nvim_tabpage_is_valid(tabpage) then
    return
  end

  local ok, tabnr = pcall(vim.api.nvim_tabpage_get_number, tabpage)
  if ok then
    pcall(vim.cmd, tabnr .. 'tabclose')
  end
end

local function send_terminal_input(bufnr, input)
  local job_id = vim.b[bufnr].terminal_job_id
  if not job_id or job_id <= 0 then
    return
  end

  vim.api.nvim_chan_send(job_id, input)
end

function M.open_status()
  require('neogit').open()
end

function M.open_stash_popup()
  require('neogit').open { 'stash' }
end

function M.open_stash_list()
  require('neogit').action('stash', 'list')()
end

function M.open_rebase_popup()
  require('neogit').open { 'rebase' }
end

function M.open_reset_picker()
  telescope_git_picker('git_commits', {
    prompt_title = 'Git Commits (<C-r>m mixed, <C-r>s soft, <C-r>h hard)',
    git_command = {
      'git',
      'log',
      '--pretty=oneline',
      '--abbrev-commit',
      'HEAD~1',
    },
  })
end

function M.open_branch_picker()
  telescope_git_picker('git_branches', {
    prompt_title = 'Git Branches (<CR> checkout, <C-r> rebase)',
  })
end

function M.open_dash()
  vim.cmd.tabnew()

  local tabpage = vim.api.nvim_get_current_tabpage()
  local bufnr = vim.api.nvim_get_current_buf()

  vim.bo[bufnr].buflisted = false
  vim.bo[bufnr].bufhidden = 'hide'

  local job_id = vim.fn.termopen({ 'gh', 'dash' }, {
    cwd = repo_root(),
    on_exit = vim.schedule_wrap(function(_, code)
      if code ~= 0 then
        return
      end

      if dash_tab_is_dedicated(tabpage, bufnr) then
        close_tabpage(tabpage)
      end
    end),
  })

  if job_id <= 0 then
    vim.notify('Failed to start gh dash', vim.log.levels.ERROR)

    if dash_tab_is_dedicated(tabpage, bufnr) then
      close_tabpage(tabpage)
    end

    return
  end

  vim.keymap.set('n', 'q', function()
    send_terminal_input(bufnr, 'q')
  end, {
    buffer = bufnr,
    desc = 'Quit GitHub dash',
  })

  vim.cmd.startinsert()
end

function M.toggle_line_blame()
  require('gitsigns').toggle_current_line_blame()
end

return M
