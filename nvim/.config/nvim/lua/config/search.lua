local M = {}

M.ignored_paths = {
  '.git',
  'zsh/.config/zsh/oh-my-zsh',
  'zsh/.config/zsh/custom/plugins',
}

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

return M
