local M = {}

M.ignored_paths = {
  '.git',
  'zsh/.config/zsh/oh-my-zsh',
  'zsh/.config/zsh/custom/plugins',
}

local function shell_join(args)
  return table.concat(vim.tbl_map(vim.fn.shellescape, args), ' ')
end

local function append_exclude_globs(args)
  for _, path in ipairs(M.ignored_paths) do
    table.insert(args, '--glob')
    table.insert(args, '!' .. path)
    table.insert(args, '--glob')
    table.insert(args, '!**/' .. path)
    table.insert(args, '--glob')
    table.insert(args, '!**/' .. path .. '/**')
  end
end

function M.find_command()
  local args = {
    'rg',
    '--files',
    '--hidden',
  }

  append_exclude_globs(args)

  return args
end

function M.fzf_files_command()
  return shell_join(M.find_command())
end

function M.vimgrep_arguments()
  local args = {
    'rg',
    '--color=never',
    '--no-heading',
    '--with-filename',
    '--line-number',
    '--column',
    '--smart-case',
    '--hidden',
  }

  append_exclude_globs(args)

  return args
end

function M.fzf_live_grep_command()
  local args = {
    'rg',
    '--column',
    '--line-number',
    '--no-heading',
    '--color=always',
    '--smart-case',
    '--hidden',
  }

  append_exclude_globs(args)

  return shell_join(args)
end

local last_engine = nil

-- Wrap a picker callback so the engine is recorded on every invocation.
function M.track(engine, fn)
  return function(...)
    last_engine = engine
    fn(...)
  end
end

function M.resume()
  if last_engine == 'fzf' then
    require('fzf-lua').resume()
  elseif last_engine == 'telescope' then
    require('telescope.builtin').resume()
  else
    vim.notify('No search to resume', vim.log.levels.INFO)
  end
end

return M
