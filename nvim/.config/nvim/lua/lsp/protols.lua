local monorepo = require 'lsp.monorepo'

local M = {}

local function normalize_path(path)
  if not path or path == '' then
    return vim.fn.getcwd()
  end

  local stat = vim.uv.fs_stat(path)
  if stat and stat.type == 'directory' then
    return path
  end

  return vim.fs.dirname(path) or path
end

local function root_dir(path)
  local start = normalize_path(path)

  if monorepo.is_under_root(start) then
    return monorepo.root
  end

  return vim.fs.root(start, { 'protols.toml', 'WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel', '.git' }) or start
end

local function cmd()
  local executable = vim.fn.exepath 'protols'
  if executable == '' then
    executable = vim.fs.joinpath(vim.fn.stdpath 'data', 'mason', 'bin', 'protols')
  end

  return { executable, '--include-paths=' .. table.concat(monorepo.proto_include_paths, ',') }
end

function M.root_dir(bufnr, on_dir)
  local path = vim.api.nvim_buf_get_name(bufnr)
  if path == '' then
    on_dir(nil)
    return
  end

  on_dir(root_dir(path))
end

M.cmd = cmd()
M.filetypes = { 'proto' }
M.init_options = {
  include_paths = monorepo.proto_include_paths,
}

M._helpers = {
  cmd = cmd,
  root_dir = root_dir,
}

return M
