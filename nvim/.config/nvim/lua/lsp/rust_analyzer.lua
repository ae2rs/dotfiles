local monorepo = require 'lsp.monorepo'

local M = {}

local FALLBACK_DISCOVER_TITLE = 'Discover workspace'

local default_settings = {
  ['rust-analyzer'] = {
    diagnostics = {
      enable = true,
    },
    cargo = {
      allFeatures = true,
      loadOutDirsFromCheck = true,
      buildScripts = {
        enable = true,
      },
    },
    procMacro = {
      enable = true,
    },
  },
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

local function mason_bin(name)
  local path = vim.fs.joinpath(vim.fn.stdpath 'data', 'mason', 'bin', name)
  if vim.fn.executable(path) == 1 then
    return path
  end

  local exepath = vim.fn.exepath(name)
  if exepath ~= '' then
    return exepath
  end

  return name
end

local function python3_cmd()
  local exepath = vim.fn.exepath 'python3'
  if exepath ~= '' then
    return exepath
  end

  return 'python3'
end

local function debug_log(message)
  if vim.lsp.log and vim.lsp.log.info then
    pcall(vim.lsp.log.info, '[rust_analyzer] ' .. message)
  end
end

local function wrap_discover_command(command)
  if type(command) ~= 'table' or vim.tbl_isempty(command) then
    return command
  end

  local wrapper = vim.fs.joinpath(vim.fn.stdpath 'config', 'scripts', 'rust_analyzer_discover.py')
  if vim.fn.filereadable(wrapper) == 0 then
    debug_log('discover wrapper missing at ' .. wrapper)
    return command
  end

  return vim.list_extend({ python3_cmd(), wrapper }, vim.deepcopy(command))
end

local function absolutize_command(command, project_root)
  if type(command) ~= 'table' or vim.tbl_isempty(command) or not project_root or project_root == '' then
    return command
  end

  local executable = command[1]
  if type(executable) ~= 'string' or executable == '' or executable:match '^/' or not executable:find '/' then
    return command
  end

  local absolute = vim.fs.normalize(vim.fs.joinpath(project_root, executable))
  if not vim.uv.fs_stat(absolute) then
    return command
  end

  local resolved = vim.deepcopy(command)
  resolved[1] = absolute
  return resolved
end

local function root_dir(path)
  local start = normalize_path(path)

  return vim.fs.root(start, { 'rust-analyzer.json' }) or vim.fs.root(start, { 'Cargo.toml' }) or vim.fs.root(start, { '.git' }) or start
end

local function load_project_settings(project_root)
  local settings = vim.deepcopy(default_settings)
  if not project_root or project_root == '' then
    return settings
  end

  local path = vim.fs.joinpath(project_root, 'rust-analyzer.json')
  if not vim.uv.fs_stat(path) then
    return settings
  end

  local ok_read, lines = pcall(vim.fn.readfile, path)
  if not ok_read then
    return settings
  end

  local ok_json, overrides = pcall(vim.json.decode, table.concat(lines, '\n'))
  if not ok_json or type(overrides) ~= 'table' then
    return settings
  end

  local merged = vim.tbl_deep_extend('force', settings, overrides)
  if merged['rust-analyzer'] then
    merged['rust-analyzer'].lspMux = nil
  end

  return merged
end

local function prepare_settings(project_root)
  local settings = load_project_settings(project_root)
  local rust_settings = settings['rust-analyzer']
  local cargo = rust_settings and rust_settings.cargo
  local build_scripts = cargo and cargo.buildScripts
  local check = rust_settings and rust_settings.check
  local discover = rust_settings and rust_settings.workspace and rust_settings.workspace.discoverConfig

  if build_scripts and build_scripts.overrideCommand then
    build_scripts.overrideCommand = absolutize_command(build_scripts.overrideCommand, project_root)
  end

  if check and check.overrideCommand then
    check.overrideCommand = absolutize_command(check.overrideCommand, project_root)
  end

  if discover and discover.command then
    discover.command = absolutize_command(discover.command, project_root)
    discover.command = wrap_discover_command(discover.command)
  end

  return settings
end

local function replace_table(dst, src)
  for key in pairs(dst) do
    dst[key] = nil
  end
  for key, value in pairs(src) do
    dst[key] = value
  end
  return dst
end

local function apply_project_config(config, project_root)
  local settings = prepare_settings(project_root)
  local init_options = vim.deepcopy(settings['rust-analyzer'] or {})

  if type(config.settings) == 'table' then
    config.settings = replace_table(config.settings, settings)
  else
    config.settings = settings
  end
  config.init_options = init_options

  return config.settings, init_options
end

function M.root_dir(bufnr, on_dir)
  local path = vim.api.nvim_buf_get_name(bufnr)
  if path == '' then
    on_dir(nil)
    return
  end

  on_dir(root_dir(path))
end

function M.before_init(init_params, config)
  local settings, init_options = apply_project_config(config, config.root_dir)
  init_params.initializationOptions = vim.deepcopy(init_options)

  local discover = init_options.workspace and init_options.workspace.discoverConfig
  local discover_command = discover and discover.command or {}
  debug_log(
    ('root=%s cmd=%s discover=%s title=%s'):format(
      tostring(config.root_dir),
      table.concat(config.cmd or {}, ' '),
      table.concat(discover_command, ' '),
      FALLBACK_DISCOVER_TITLE
    )
  )
end

function M.on_new_config(config, project_root)
  local settings, init_options = apply_project_config(config, project_root)
  local discover = init_options.workspace and init_options.workspace.discoverConfig
  local discover_command = discover and discover.command or {}

  debug_log(('new_config root=%s cmd=%s discover=%s'):format(tostring(project_root), table.concat(config.cmd or {}, ' '), table.concat(discover_command, ' ')))
end

M.cmd = { mason_bin 'rust-analyzer' }
M.name = 'rust_analyzer'
M.filetypes = { 'rust' }
M.settings = vim.deepcopy(default_settings)
M.init_options = vim.deepcopy(default_settings['rust-analyzer'])

M._helpers = {
  FALLBACK_DISCOVER_TITLE = FALLBACK_DISCOVER_TITLE,
  default_settings = default_settings,
  load_project_settings = load_project_settings,
  prepare_settings = prepare_settings,
  root_dir = root_dir,
  monorepo_root = monorepo.root,
  mason_bin = mason_bin,
  wrap_discover_command = wrap_discover_command,
}

return M
