local M = {}

M.root = '/Users/lucas/work/monorepo'
M.proto_include_paths = {
  M.root .. '/rs',
  M.root .. '/rs/proto',
}

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

function M.is_under_root(path)
  local normalized = normalize_path(path)
  return normalized == M.root or vim.startswith(normalized, M.root .. '/')
end

local function should_suppress_notify(msg)
  local text = msg
  if type(msg) == 'table' and type(msg.message) == 'string' then
    text = msg.message
  end

  if type(text) ~= 'string' then
    return false
  end

  local normalized = text:lower()
  return normalized:match 'overly%s+long%s+loop%s+turn%s+took'
    or normalized:match 'emfile'
    or normalized:match 'too many open files'
    or normalized:match 'failed to discover workspace'
    or normalized:match 'failed to load workspaces'
end

local function should_suppress_lsp_message(msg)
  if type(msg) ~= 'string' then
    return false
  end

  local normalized = msg:lower()
  return normalized:match 'overly%s+long%s+loop%s+turn%s+took' ~= nil
    or normalized:match 'failed to discover workspace' ~= nil
    or normalized:match 'failed to load workspaces' ~= nil
end

function M.setup_message_filters()
  if M._message_filters_installed then
    return
  end

  M._message_filters_installed = true

  local notify = vim.notify
  vim.notify = function(msg, level, opts)
    if should_suppress_notify(msg) then
      return
    end

    return notify(msg, level, opts)
  end

  local log_handler = vim.lsp.handlers['window/logMessage']
  vim.lsp.handlers['window/logMessage'] = function(err, result, ctx, config)
    if result and should_suppress_lsp_message(result.message) then
      return
    end

    return log_handler(err, result, ctx, config)
  end

  local show_handler = vim.lsp.handlers['window/showMessage']
  vim.lsp.handlers['window/showMessage'] = function(err, result, ctx, config)
    if result and should_suppress_lsp_message(result.message) then
      return
    end

    return show_handler(err, result, ctx, config)
  end
end

return M
