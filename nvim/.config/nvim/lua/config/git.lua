local M = {}

local reset_modes = {
  {
    mode = 'mixed',
    label = 'mixed    (HEAD and index)',
    reset = function(git, target)
      return git.reset.mixed(target)
    end,
  },
  {
    mode = 'hard',
    label = 'hard     (HEAD, index and files)',
    reset = function(git, target)
      return git.reset.hard(target)
    end,
  },
  {
    mode = 'soft',
    label = 'soft     (HEAD only)',
    reset = function(git, target)
      return git.reset.soft(target)
    end,
  },
  {
    mode = 'keep',
    label = 'keep     (HEAD and index, keeping uncommitted)',
    reset = function(git, target)
      return git.reset.keep(target)
    end,
  },
  {
    mode = 'index',
    label = 'index    (only)',
    reset = function(git, target)
      return git.reset.index(target)
    end,
  },
  {
    mode = 'worktree',
    label = 'worktree (only)',
    reset = function(git, target)
      return git.reset.worktree(target)
    end,
  },
}

local function with_repo_refresh(callback)
  local git = require 'neogit.lib.git'

  if git.repo and git.repo.dispatch_refresh then
    git.repo:dispatch_refresh {
      source = 'action',
      callback = callback,
    }
    return
  end

  callback()
end

local function select_commit(callback)
  local git = require 'neogit.lib.git'
  local commits = git.log.list({ '--max-count=257' }, nil, {}, true)
  local choices = {}

  for index, commit in ipairs(commits) do
    if index > 1 then
      table.insert(choices, commit)
    end
  end

  vim.ui.select(choices, {
    prompt = 'Reset to previous commit',
    format_item = function(item)
      local rel_date = item.rel_date and (' [' .. item.rel_date .. ']') or ''
      return string.format('%s %s%s', item.abbreviated_commit, item.subject, rel_date)
    end,
  }, function(choice)
    callback(choice and choice.oid or nil)
  end)
end

local function reset_to_commit(target)
  local event = require 'neogit.lib.event'
  local git = require 'neogit.lib.git'
  local notification = require 'neogit.lib.notification'
  local branch = git.branch.current() or 'HEAD'

  vim.ui.select(reset_modes, {
    prompt = string.format('Reset %s to %s', branch, target),
    format_item = function(item)
      return item.label
    end,
  }, function(choice)
    if not choice then
      return
    end

    local success = choice.reset(git, target)
    if success then
      notification.info('Reset to ' .. target)
      event.send('Reset', { commit = target, mode = choice.mode })
    else
      notification.error 'Reset Failed'
    end
  end)
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

function M.open_reset_popup()
  with_repo_refresh(function()
    select_commit(function(target)
      if target then
        reset_to_commit(target)
      end
    end)
  end)
end

function M.rebase_onto_upstream_or_base()
  local git = require 'neogit.lib.git'
  local branch = git.branch.current()
  local upstream = branch and git.branch.upstream(branch) or nil

  if upstream then
    return with_repo_refresh(function()
      git.rebase.onto_branch(upstream, {})
    end)
  end

  local base_branch = git.branch.base_branch()
  if base_branch and base_branch ~= branch then
    return with_repo_refresh(function()
      git.rebase.onto_branch(base_branch, {})
    end)
  end

  M.open_rebase_popup()
end

return M
