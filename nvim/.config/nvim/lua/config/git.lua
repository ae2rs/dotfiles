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

function M.toggle_line_blame()
  require('gitsigns').toggle_current_line_blame()
end

return M
