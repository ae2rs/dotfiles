local M = {
  group_specs = {},
}

local function merge_opts(desc, opts)
  local map_opts = opts and vim.deepcopy(opts) or {}
  if desc then
    map_opts.desc = desc
  end
  return map_opts
end

function M.map(mode, lhs, rhs, desc, opts)
  vim.keymap.set(mode, lhs, rhs, merge_opts(desc, opts))
end

function M.leader(mode, suffix, rhs, desc, opts)
  M.map(mode, '<leader>' .. suffix, rhs, desc, opts)
end

function M.localleader(mode, suffix, rhs, desc, opts)
  M.map(mode, '<localleader>' .. suffix, rhs, desc, opts)
end

function M.group(lhs, group, opts)
  local spec = opts and vim.deepcopy(opts) or {}
  spec[1] = lhs
  spec.group = group
  table.insert(M.group_specs, spec)
end

function M.leader_group(suffix, group, opts)
  M.group('<leader>' .. suffix, group, opts)
end

function M.localleader_group(suffix, group, opts)
  M.group('<localleader>' .. suffix, group, opts)
end

function M.which_key_spec()
  return vim.deepcopy(M.group_specs)
end

return M
