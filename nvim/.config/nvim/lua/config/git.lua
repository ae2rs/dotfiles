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

local function reset_to_commit(status_buf, oid, abbrev)
  vim.ui.select({ 'mixed', 'soft', 'hard' }, {
    prompt = ('Reset to %s — mode?'):format(abbrev),
  }, function(choice)
    if not choice then
      return
    end
    local a = require 'neogit.lib.async'
    local notification = require 'neogit.lib.notification'
    local reset = require('neogit.lib.git').reset
    a.void(function()
      notification.info(('Resetting --%s to %s…'):format(choice, abbrev))
      if reset[choice](oid) then
        notification.info(('Reset --%s to %s'):format(choice, abbrev))
      else
        notification.error(('Reset --%s to %s failed'):format(choice, abbrev))
      end
      if status_buf then
        status_buf:dispatch_refresh(nil, 'reset')
      end
    end)()
  end)
end

function M.open_reset_picker(status_buf)
  if vim.bo.filetype == 'NeogitStatus' then
    if not (status_buf and status_buf.buffer and status_buf.buffer.ui) then
      local ok, status = pcall(require, 'neogit.buffers.status')
      if ok then
        status_buf = status.instance(vim.fn.getcwd(0)) or status.instance()
      end
    end
    if status_buf and status_buf.buffer and status_buf.buffer.ui then
      local item = status_buf.buffer.ui:get_item_under_cursor()
      local commit = item and type(item.commit) == 'table' and item.commit
      if commit and commit.oid then
        local abbrev = commit.abbreviated_commit or commit.oid:sub(1, 7)
        reset_to_commit(status_buf, commit.oid, abbrev)
        return
      end
    end
  end

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
  local actions = require 'telescope.actions'
  telescope_git_picker('git_branches', {
    prompt_title = 'Branches  <CR>/o:checkout  r:rebase  m:merge  d:delete  n:new  R:rename  t:track',
    initial_mode = 'normal',
    show_remote_tracking_branches = false,
    attach_mappings = function(_, map)
      map('n', 'o', actions.git_checkout)
      map('n', 'r', actions.git_rebase_branch)
      map('n', 'm', actions.git_merge_branch)
      map('n', 'M', actions.git_merge_branch)
      map('n', 'd', actions.git_delete_branch)
      map('n', 'n', actions.git_create_branch)
      map('n', 'R', actions.git_rename_branch)
      map('n', 't', actions.git_track_branch)
      map('n', 's', actions.git_switch_branch)
      return true
    end,
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
