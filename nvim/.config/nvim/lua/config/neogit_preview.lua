-- Right-side preview panel for Neogit status.
--
-- Mirrors the cursor target (file change / recent commit / local branch /
-- stash) into a scratch buffer in a vsplit on the right. Purely passive:
-- <cr> keeps Neogit's default GoToFile / commit_view behavior.

local M = {}

local state = {
  installed = false,
  preview_win = nil,
  preview_buf = nil,
  status_buf = nil,
  status_win = nil,
  timer = nil,
  last_key = nil,
  generation = 0,
  suspended = false,
  suspend_self_close = false,
}

local MIN_COLUMNS = 160
local DEBOUNCE_MS = 70
local MAX_LINES = 5000
local UNTRACKED_MAX_LINES = 500

local function is_valid_win(win)
  return win and vim.api.nvim_win_is_valid(win)
end

local function is_valid_buf(buf)
  return buf and vim.api.nvim_buf_is_valid(buf)
end

local function teardown()
  if state.timer then
    state.timer:stop()
    state.timer:close()
    state.timer = nil
  end
  if is_valid_win(state.preview_win) then
    pcall(vim.api.nvim_win_close, state.preview_win, true)
  end
  if is_valid_buf(state.preview_buf) then
    pcall(vim.api.nvim_buf_delete, state.preview_buf, { force = true })
  end
  state.preview_win = nil
  state.preview_buf = nil
  state.status_buf = nil
  state.status_win = nil
  state.last_key = nil
  state.suspended = false
  state.suspend_self_close = false
end

local function write(lines, filetype)
  if not is_valid_buf(state.preview_buf) then
    return
  end
  vim.bo[state.preview_buf].modifiable = true
  vim.api.nvim_buf_set_lines(state.preview_buf, 0, -1, false, lines)
  vim.bo[state.preview_buf].modifiable = false
  vim.bo[state.preview_buf].filetype = filetype or 'git'
  if is_valid_win(state.preview_win) then
    pcall(vim.api.nvim_win_set_cursor, state.preview_win, { 1, 0 })
  end
end

local function git_root()
  local start = (is_valid_win(state.status_win) and vim.fn.getcwd(state.status_win)) or vim.fn.getcwd()
  local dir = vim.fn.finddir('.git', start .. ';')
  if dir == '' then
    -- finddir misses worktree links (.git is a file there). Try fs.find.
    local hits = vim.fs.find('.git', { upward = true, path = start, limit = 1 })
    if hits and hits[1] then
      return vim.fn.fnamemodify(hits[1], ':h')
    end
    return start
  end
  return vim.fn.fnamemodify(dir, ':h')
end

local function run_git(args, on_done)
  local cwd = git_root()
  local cmd = { 'git', '--no-pager' }
  for _, a in ipairs(args) do
    cmd[#cmd + 1] = a
  end
  local gen = state.generation
  vim.system(cmd, { text = true, cwd = cwd }, vim.schedule_wrap(function(result)
    if gen ~= state.generation then
      return
    end
    on_done(result)
  end))
end

local function truncate(lines, limit)
  if #lines <= limit then
    return lines
  end
  local out = {}
  for i = 1, limit do
    out[i] = lines[i]
  end
  out[limit + 1] = ''
  out[limit + 2] = ('-- truncated at %d lines --'):format(limit)
  return out
end

local function split_output(text)
  if not text or text == '' then
    return { '' }
  end
  local lines = vim.split(text, '\n', { plain = true })
  -- vim.split keeps a trailing empty when text ends in \n; drop it.
  if lines[#lines] == '' then
    lines[#lines] = nil
  end
  return lines
end

local function render_git(args, filetype, limit)
  run_git(args, function(result)
    local lines = split_output(result.stdout)
    if (not result.stdout or result.stdout == '') and result.stderr and result.stderr ~= '' then
      lines = split_output(result.stderr)
    end
    if #lines == 0 then
      lines = { '' }
    end
    write(truncate(lines, limit or MAX_LINES), filetype or 'git')
  end)
end

local function render_dir_listing(path, header_kind)
  -- header_kind: 'untracked' | 'staged' | 'unstaged'
  local args
  if header_kind == 'untracked' then
    args = { 'ls-files', '--others', '--exclude-standard', '--', path }
  elseif header_kind == 'staged' then
    args = { 'diff', '--cached', '--name-status', '--', path }
  else
    args = { 'diff', '--name-status', '--', path }
  end
  run_git(args, function(result)
    local files = split_output(result.stdout)
    if #files == 1 and files[1] == '' then
      files = {}
    end
    local lines = { ('-- %s: %d file(s) --'):format(path, #files), '' }
    for _, f in ipairs(files) do
      lines[#lines + 1] = f
    end
    if #files == 0 then
      lines[#lines + 1] = '(empty)'
    end
    write(truncate(lines, MAX_LINES), 'git')
  end)
end

local function render_untracked(path)
  if vim.fn.isdirectory(path) == 1 then
    render_dir_listing(path, 'untracked')
    return
  end
  state.generation = state.generation + 1
  local gen = state.generation
  vim.uv.fs_open(path, 'r', 438, function(open_err, fd)
    if open_err or not fd then
      vim.schedule(function()
        if gen == state.generation then
          write({ '-- cannot read file --' }, 'text')
        end
      end)
      return
    end
    vim.uv.fs_fstat(fd, function(stat_err, stat)
      if stat_err or not stat then
        vim.uv.fs_close(fd)
        return
      end
      local size = math.min(stat.size, 256 * 1024)
      vim.uv.fs_read(fd, size, 0, function(read_err, data)
        vim.uv.fs_close(fd)
        if read_err or not data then
          return
        end
        vim.schedule(function()
          if gen ~= state.generation then
            return
          end
          local lines = split_output(data)
          local ft = vim.filetype.match { filename = path, contents = lines } or 'text'
          write(truncate(lines, UNTRACKED_MAX_LINES), ft)
        end)
      end)
    end)
  end)
end

local function section_name(status)
  local ok, comp = pcall(function()
    return status.buffer.ui:get_current_section()
  end)
  if not ok or not comp then
    return nil
  end
  return comp.options and comp.options.section
end

local function refresh()
  if not is_valid_buf(state.preview_buf) then
    return
  end
  if not is_valid_win(state.status_win) then
    return
  end

  local ok_status, status_mod = pcall(require, 'neogit.buffers.status')
  if not ok_status then
    return
  end
  local status = status_mod.instance(vim.fn.getcwd(state.status_win)) or status_mod.instance()
  if not status or not status.buffer or not status.buffer.ui then
    return
  end

  -- Run cursor introspection in the context of the status window.
  local item, oid, sect
  vim.api.nvim_win_call(state.status_win, function()
    pcall(function()
      item = status.buffer.ui:get_item_under_cursor()
    end)
    pcall(function()
      oid = status.buffer.ui:get_commit_under_cursor()
    end)
    sect = section_name(status)
  end)

  local kind, key, dispatch

  if item and rawget(item, 'kind') == 'branch' and item.branch then
    kind, key = 'branch', 'branch:' .. item.branch
    local branch = item.branch
    dispatch = function()
      render_git({ 'log', '--oneline', '--decorate', '--graph', '-30', branch, '--' }, 'git')
    end
  elseif item and type(item.commit) == 'table' and item.commit.oid then
    kind, key = 'commit', 'commit:' .. item.commit.oid
    local commit_oid = item.commit.oid
    dispatch = function()
      render_git({ 'show', '--stat', '--patch', '--no-color', commit_oid }, 'git')
    end
  elseif oid then
    kind, key = 'commit', 'commit:' .. oid
    local commit_oid = oid
    dispatch = function()
      render_git({ 'show', '--stat', '--patch', '--no-color', commit_oid }, 'git')
    end
  elseif item and item.name and item.name:match('^stash@{%d+}$') then
    kind, key = 'stash', 'stash:' .. item.name
    local name = item.name
    dispatch = function()
      render_git({ 'stash', 'show', '-p', '--no-color', name }, 'git')
    end
  elseif item and item.absolute_path then
    local path = item.absolute_path
    local is_dir = vim.fn.isdirectory(path) == 1
    if sect == 'staged' then
      kind, key = 'staged', 'staged:' .. path
      dispatch = function()
        if is_dir then
          render_dir_listing(path, 'staged')
        else
          render_git({ 'diff', '--cached', '--no-color', '--', path }, 'git')
        end
      end
    elseif sect == 'untracked' then
      kind, key = 'untracked', 'untracked:' .. path
      dispatch = function()
        render_untracked(path)
      end
    else
      kind, key = 'unstaged', 'unstaged:' .. path
      dispatch = function()
        if is_dir then
          render_dir_listing(path, 'unstaged')
        else
          render_git({ 'diff', '--no-color', '--', path }, 'git')
        end
      end
    end
  else
    kind, key = 'none', 'none'
    dispatch = function()
      write({ '-- no preview --' }, 'text')
    end
  end

  if key == state.last_key then
    return
  end
  state.last_key = key
  state.generation = state.generation + 1
  dispatch()
end

local function schedule_refresh()
  if not state.timer then
    state.timer = vim.uv.new_timer()
  end
  state.timer:stop()
  state.timer:start(DEBOUNCE_MS, 0, vim.schedule_wrap(refresh))
end

local function ensure_preview_buf()
  if is_valid_buf(state.preview_buf) then
    return
  end
  state.preview_buf = vim.api.nvim_create_buf(false, true)
  vim.bo[state.preview_buf].buftype = 'nofile'
  vim.bo[state.preview_buf].bufhidden = 'hide'
  vim.bo[state.preview_buf].swapfile = false
  vim.bo[state.preview_buf].modifiable = false
  pcall(vim.api.nvim_buf_set_name, state.preview_buf, 'NeogitPreview://' .. state.preview_buf)
end

local function ensure_preview_win()
  if is_valid_win(state.preview_win) then
    return
  end
  if not is_valid_win(state.status_win) then
    return
  end
  ensure_preview_buf()
  vim.api.nvim_win_call(state.status_win, function()
    vim.cmd 'rightbelow vsplit'
    local win = vim.api.nvim_get_current_win()
    vim.api.nvim_win_set_buf(win, state.preview_buf)
    local width = math.max(60, math.floor(vim.o.columns * 0.45))
    vim.api.nvim_win_set_width(win, width)
    vim.wo[win].winfixwidth = true
    vim.wo[win].number = false
    vim.wo[win].relativenumber = false
    vim.wo[win].signcolumn = 'no'
    vim.wo[win].foldcolumn = '0'
    vim.wo[win].cursorline = false
    vim.wo[win].wrap = false
    state.preview_win = win
  end)
  if is_valid_win(state.status_win) then
    pcall(vim.api.nvim_set_current_win, state.status_win)
  end
end

local function close_preview_win()
  if not is_valid_win(state.preview_win) then
    state.preview_win = nil
    return
  end
  state.suspend_self_close = true
  pcall(vim.api.nvim_win_close, state.preview_win, true)
  state.preview_win = nil
  state.suspend_self_close = false
end

local function suspend()
  if state.suspended then
    return
  end
  state.suspended = true
  close_preview_win()
end

local function resume()
  if not state.suspended then
    return
  end
  state.suspended = false
  if not is_valid_buf(state.status_buf) or not is_valid_win(state.status_win) then
    return
  end
  ensure_preview_win()
  state.last_key = nil
  schedule_refresh()
end

local function open_for(status_buf)
  if vim.o.columns < MIN_COLUMNS then
    return
  end
  if not is_valid_buf(status_buf) then
    return
  end

  -- If we're attaching to a different status buffer than before, tear down first.
  if state.status_buf and state.status_buf ~= status_buf then
    teardown()
  end

  state.status_buf = status_buf
  state.status_win = vim.fn.bufwinid(status_buf)
  if not is_valid_win(state.status_win) then
    return
  end

  ensure_preview_buf()
  ensure_preview_win()

  state.last_key = nil
  schedule_refresh()

  local augroup = vim.api.nvim_create_augroup('NeogitPreview_' .. status_buf, { clear = true })

  vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
    group = augroup,
    buffer = status_buf,
    callback = schedule_refresh,
  })

  vim.api.nvim_create_autocmd('User', {
    group = augroup,
    pattern = 'NeogitStatusRefreshed',
    callback = function()
      state.last_key = nil
      schedule_refresh()
    end,
  })

  vim.api.nvim_create_autocmd({ 'BufWipeout', 'BufHidden' }, {
    group = augroup,
    buffer = status_buf,
    callback = function()
      vim.schedule(teardown)
    end,
  })

  vim.api.nvim_create_autocmd('WinClosed', {
    group = augroup,
    callback = function(args)
      if state.suspend_self_close then
        return
      end
      local closed = tonumber(args.match)
      if closed == state.status_win then
        vim.schedule(teardown)
      elseif closed == state.preview_win then
        -- User closed the preview manually (e.g. :q in it). Tear down only
        -- if we're not in the middle of a suspend cycle.
        if not state.suspended then
          vim.schedule(teardown)
        end
      end
    end,
  })

  vim.api.nvim_create_autocmd('FileType', {
    group = augroup,
    pattern = 'NeogitCommitView',
    callback = function(args)
      -- Track this commit_view buffer; reopen the preview when it goes away.
      local cv_buf = args.buf
      suspend()
      vim.api.nvim_create_autocmd({ 'BufWipeout', 'BufHidden', 'BufUnload' }, {
        group = augroup,
        buffer = cv_buf,
        once = true,
        callback = function()
          vim.schedule(resume)
        end,
      })
    end,
  })
end

function M.setup()
  if state.installed then
    return
  end
  state.installed = true

  vim.api.nvim_create_autocmd('FileType', {
    pattern = 'NeogitStatus',
    callback = function(args)
      vim.schedule(function()
        open_for(args.buf)
      end)
    end,
  })
end

return M
