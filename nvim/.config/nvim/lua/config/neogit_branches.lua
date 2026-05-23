local M = {}

local SPINNER_FRAMES = { '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' }
local NS = vim.api.nvim_create_namespace 'neogit_branches_busy'

-- {
--   op            = 'checkout',
--   label         = "checking out 'foo'",
--   target        = { name = 'foo', fallback_line = 12 } | { line = 42 },
--   cursor_target = 'foo'   -- optional; defaults to target.name
--   status        = <neogit status instance>,
--   buf           = <buffer handle>,
--   frame         = 1,
--   timer, safety_timer, cursor_au,
-- }
M._busy = nil

local function repo_root()
  local ok, git = pcall(require, 'neogit.lib.git')
  if ok then
    local root = git.cli.worktree_root '.'
    if root and root ~= '' then
      return root
    end
  end
  return vim.uv.cwd()
end

local function git_branch_is_unmerged(name)
  -- True if `name` has commits not reachable from HEAD.
  local result = vim.system({
    'git', '-C', repo_root(), 'branch', '--no-merged', 'HEAD', '--list', name,
  }, { text = true }):wait()
  if result.code ~= 0 then
    return false
  end
  return (result.stdout or ''):match '%S' ~= nil
end

local function git_delete_branch(name, force)
  local result = vim.system({
    'git', '-C', repo_root(), 'branch', force and '-D' or '-d', name,
  }, { text = true }):wait()
  local stderr = (result.stderr or ''):gsub('%s+$', '')
  return result.code == 0, stderr
end

local function fetch_branches()
  local ok, git = pcall(require, 'neogit.lib.git')
  if not ok then
    return {}
  end

  local root = git.cli.worktree_root '.'
  if not root or root == '' then
    return {}
  end

  local fmt = '%(HEAD)|%(refname:short)|%(upstream:short)|%(upstream:track)|%(subject)'
  local result = vim.system({
    'git',
    '-C',
    root,
    'for-each-ref',
    'refs/heads',
    '--sort=-committerdate',
    '--format=' .. fmt,
  }, { text = true }):wait()

  if result.code ~= 0 then
    return {}
  end

  local branches = {}
  for line in vim.gsplit(result.stdout or '', '\n', { plain = true }) do
    if line ~= '' then
      local head, name, upstream, track, subject = line:match '^(.)|([^|]*)|([^|]*)|([^|]*)|(.*)$'
      if name then
        local ahead = tonumber(track:match 'ahead (%d+)') or 0
        local behind = tonumber(track:match 'behind (%d+)') or 0
        table.insert(branches, {
          name = name,
          is_head = head == '*',
          upstream = upstream,
          ahead = ahead,
          behind = behind,
          subject = subject,
        })
      end
    end
  end

  for i, b in ipairs(branches) do
    if b.is_head and i > 1 then
      table.remove(branches, i)
      table.insert(branches, 1, b)
      break
    end
  end

  return branches
end

local function build_section()
  local Ui = require 'neogit.lib.ui'
  local common = require 'neogit.buffers.common'
  local col, row, text = Ui.col, Ui.row, Ui.text
  local EmptyLine = common.EmptyLine

  local branches = fetch_branches()

  local function format_trail(b)
    local parts = {}
    if b.ahead > 0 then
      table.insert(parts, ('↑%d'):format(b.ahead))
    end
    if b.behind > 0 then
      table.insert(parts, ('↓%d'):format(b.behind))
    end
    return table.concat(parts, ' ')
  end

  local function pad_display(s, width)
    local w = vim.fn.strdisplaywidth(s)
    if w >= width then
      return s
    end
    return s .. string.rep(' ', width - w)
  end

  local widths = { name = 0, upstream = 0, trail = 0 }
  for _, b in ipairs(branches) do
    widths.name = math.max(widths.name, vim.fn.strdisplaywidth(b.name))
    widths.upstream = math.max(widths.upstream, vim.fn.strdisplaywidth(b.upstream or ''))
    widths.trail = math.max(widths.trail, vim.fn.strdisplaywidth(format_trail(b)))
  end
  widths.name = widths.name + 2
  widths.upstream = widths.upstream + 2
  widths.trail = math.max(widths.trail + 2, 4)

  local function render_branch(b)
    local head_hl = b.is_head and 'NeogitBranch' or nil
    local upstream_hl = b.is_head and 'NeogitBranch' or 'NeogitRemote'

    local marker_text = b.is_head and text.highlight(head_hl)('* ') or text '  '
    local name_text = b.is_head and text.highlight(head_hl)(pad_display(b.name, widths.name))
      or text(pad_display(b.name, widths.name))

    local upstream_value = b.upstream or ''
    local upstream_text = upstream_value ~= ''
        and text.highlight(upstream_hl)(pad_display(upstream_value, widths.upstream))
      or text(pad_display('', widths.upstream))

    local trail = format_trail(b)
    local trail_text = trail ~= '' and text.highlight 'NeogitGraphYellow'(pad_display(trail, widths.trail))
      or text(pad_display('', widths.trail))

    local children = {
      marker_text,
      name_text,
      upstream_text,
      trail_text,
    }

    if b.subject and b.subject ~= '' then
      table.insert(children, text.highlight 'NeogitSubtleText'(b.subject))
    end

    return row(children, {
      item = { kind = 'branch', branch = b.name, name = b.name, is_head = b.is_head },
      yankable = b.name,
    })
  end

  local rendered = {}
  for _, b in ipairs(branches) do
    table.insert(rendered, render_branch(b))
  end

  return col.tag 'Section'({
    row {
      text.highlight 'NeogitSectionHeader' 'Local branches',
      text ' (',
      text.highlight 'NeogitSectionHeaderCount'(tostring(#branches)),
      text ')',
    },
    col(rendered),
    EmptyLine(),
  }, {
    foldable = true,
    folded = false,
    section = 'local_branches',
    id = 'local_branches',
  })
end

local function short_oid(oid)
  return oid and oid:sub(1, 7) or '?'
end

-- Single-key confirmation rendered in a floating popup styled to match noice's
-- cmdline_popup view: <CR>/y/Y → yes, <Esc>/anything else → no. We can't use
-- vim.fn.input (Enter-required) or vim.fn.confirm (noice has messages disabled
-- so the prompt text is stripped) — so we draw the popup ourselves.
local function confirm(msg)
  local text = ('󰥻  %s  [Y/n]'):format(msg)
  local width = math.min(math.max(40, vim.fn.strdisplaywidth(text) + 4), math.floor(vim.o.columns * 0.9))
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].bufhidden = 'wipe'
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, { ' ' .. text .. ' ' })
  vim.bo[buf].modifiable = false

  local win = vim.api.nvim_open_win(buf, false, {
    relative = 'editor',
    width = width,
    height = 1,
    row = math.floor(vim.o.lines * 0.4),
    col = math.floor((vim.o.columns - width) / 2),
    style = 'minimal',
    border = 'rounded',
    focusable = false,
    zindex = 250,
    noautocmd = true,
  })
  vim.wo[win].winhighlight = 'Normal:NormalFloat,FloatBorder:FloatBorder,FloatTitle:FloatTitle'

  vim.cmd 'redraw'
  local ok, ch = pcall(vim.fn.getcharstr)
  pcall(vim.api.nvim_win_close, win, true)
  pcall(vim.api.nvim_buf_delete, buf, { force = true })
  vim.cmd 'redraw'

  if not ok or not ch or ch == '' then
    return false
  end
  if ch == '\27' or ch == '\3' then -- <Esc> or <C-c>
    return false
  end
  if ch == '\r' or ch == '\n' then
    return true
  end
  return ch:lower() == 'y'
end

M._confirm = confirm

local function active_status(self)
  if self and self.buffer and self.buffer.ui then
    return self
  end
  local ok, status = pcall(require, 'neogit.buffers.status')
  if not ok then
    return nil
  end
  -- Neogit `lcd`s into the worktree root, so the window's cwd is the
  -- instance key. Fall back to global cwd if the lcd hasn't applied yet.
  local inst = status.instance(vim.fn.getcwd(0)) or status.instance()
  return inst
end

local function cursor_branch(self)
  self = active_status(self)
  if not self then
    return nil
  end
  local item = self.buffer.ui:get_item_under_cursor()
  if item and rawget(item, 'kind') == 'branch' and item.branch then
    return item, self
  end
end

local function cursor_commit(self)
  self = active_status(self)
  if not self then
    return nil
  end
  local item = self.buffer.ui:get_item_under_cursor()
  if item and type(item.commit) == 'table' and item.commit.oid then
    return item, self
  end
end

-- ─── Busy lock + spinner ───────────────────────────────────────────────

local function status_buf()
  local s = M._busy and M._busy.status
  local buf = s and s.buffer and s.buffer.handle
  if buf and vim.api.nvim_buf_is_valid(buf) then
    return buf
  end
end

local function find_branch_line(buf, name)
  if not buf or not name or not vim.api.nvim_buf_is_valid(buf) then
    return nil
  end
  local escaped = vim.pesc(name)
  local count = vim.api.nvim_buf_line_count(buf)
  for lnum = 0, count - 1 do
    local line = vim.api.nvim_buf_get_lines(buf, lnum, lnum + 1, false)[1]
    if line then
      -- Branches render as `[* ] <name><pad>` — name is preceded by 2 marker
      -- chars + a space, and followed by whitespace (or, if no padding, EOL).
      if line:match('^[%*%s] ' .. escaped .. '%s') or line:match('^[%*%s] ' .. escaped .. '$') then
        return lnum + 1
      end
    end
  end
end

local function target_line(buf)
  local t = M._busy and M._busy.target
  if not buf or not t then
    return nil
  end
  if t.name then
    return find_branch_line(buf, t.name)
  end
  if t.line then
    local count = vim.api.nvim_buf_line_count(buf)
    return math.min(t.line, math.max(count, 1))
  end
end

local function draw_spinner()
  if not M._busy then
    return
  end
  local buf = status_buf()
  if not buf then
    return
  end
  vim.api.nvim_buf_clear_namespace(buf, NS, 0, -1)
  local lnum = target_line(buf)
  if not lnum then
    return
  end
  local frame = SPINNER_FRAMES[M._busy.frame]
  pcall(vim.api.nvim_buf_set_extmark, buf, NS, lnum - 1, 0, {
    virt_text = { { frame .. ' ', 'NeogitGraphYellow' } },
    virt_text_pos = 'overlay',
    hl_mode = 'combine',
    priority = 200,
  })
  if M._busy.label and M._busy.label ~= '' then
    pcall(vim.api.nvim_buf_set_extmark, buf, NS, lnum - 1, 0, {
      virt_text = { { '  ' .. M._busy.label, 'NeogitSubtleText' } },
      virt_text_pos = 'eol',
      hl_mode = 'combine',
      priority = 200,
    })
  end
end

local function start_spinner()
  M._busy.frame = 1
  local timer = vim.uv.new_timer()
  M._busy.timer = timer
  timer:start(
    0,
    80,
    vim.schedule_wrap(function()
      if not M._busy then
        return
      end
      M._busy.frame = (M._busy.frame % #SPINNER_FRAMES) + 1
      draw_spinner()
    end)
  )
end

local function stop_spinner()
  local busy = M._busy
  if busy and busy.timer then
    pcall(function()
      busy.timer:stop()
      busy.timer:close()
    end)
    busy.timer = nil
  end
  local buf = status_buf()
  if buf then
    pcall(vim.api.nvim_buf_clear_namespace, buf, NS, 0, -1)
  end
end

local function install_cursor_park()
  local buf = status_buf()
  if not buf then
    return
  end
  M._busy.cursor_au = vim.api.nvim_create_autocmd('CursorMoved', {
    buffer = buf,
    callback = function()
      if not M._busy then
        return
      end
      if vim.api.nvim_get_mode().mode ~= 'n' then
        return
      end
      local lnum = target_line(buf)
      if not lnum then
        return
      end
      local win = vim.api.nvim_get_current_win()
      if vim.api.nvim_win_get_buf(win) ~= buf then
        return
      end
      local cur = vim.api.nvim_win_get_cursor(win)
      if cur[1] ~= lnum then
        pcall(vim.api.nvim_win_set_cursor, win, { lnum, cur[2] })
      end
    end,
  })
end

local function uninstall_cursor_park()
  if M._busy and M._busy.cursor_au then
    pcall(vim.api.nvim_del_autocmd, M._busy.cursor_au)
    M._busy.cursor_au = nil
  end
end

local release  -- forward decl

local function acquire(opts)
  if M._busy then
    return false
  end
  M._busy = {
    op = opts.op,
    label = opts.label,
    target = opts.target,
    cursor_target = opts.cursor_target or (opts.target and opts.target.name),
    status = opts.status,
    started_at = vim.uv.now(),
  }
  start_spinner()
  draw_spinner()
  install_cursor_park()
  local started_at = M._busy.started_at
  M._busy.safety_timer = vim.defer_fn(function()
    -- Identify this specific operation by its start timestamp, so a new
    -- operation that happens to share the same op name isn't force-released.
    if M._busy and M._busy.started_at == started_at then
      pcall(function()
        require('neogit.lib.notification').error(('Operation timed out: %s'):format(M._busy.label))
      end)
      release()
    end
  end, 30000)
  return true
end

release = function()
  if not M._busy then
    return
  end
  local busy = M._busy
  stop_spinner()
  uninstall_cursor_park()
  if busy.safety_timer then
    pcall(function()
      busy.safety_timer:stop()
      busy.safety_timer:close()
    end)
  end
  M._busy = nil
end

local function restore_cursor(status, cursor_target, fallback_line)
  if not status or not status.buffer then
    return
  end
  local buf = status.buffer.handle
  if not buf or not vim.api.nvim_buf_is_valid(buf) then
    return
  end
  local lnum
  if cursor_target then
    lnum = find_branch_line(buf, cursor_target)
  end
  if not lnum and fallback_line then
    local count = vim.api.nvim_buf_line_count(buf)
    lnum = math.min(fallback_line, math.max(count, 1))
  end
  if not lnum then
    return
  end
  local win = vim.fn.bufwinid(buf)
  if win ~= -1 then
    pcall(vim.api.nvim_win_set_cursor, win, { lnum, 0 })
  end
end

function M.is_busy()
  return M._busy ~= nil
end

local function busy_warn()
  pcall(function()
    require('neogit.lib.notification').warn(('Busy: %s'):format(M._busy.label))
  end)
end

function M._run_op(opts)
  if M.is_busy() then
    busy_warn()
    return false
  end

  local status = opts.status
  if not status then
    -- No status instance — fall back to unlocked execution.
    local a = require 'neogit.lib.async'
    a.void(function()
      pcall(opts.work)
    end)()
    return true
  end

  -- Capture pre-op cursor as fallback (e.g., when target row will disappear).
  local fallback_line
  do
    local buf = status.buffer and status.buffer.handle
    local win = buf and vim.fn.bufwinid(buf) or -1
    if win ~= -1 then
      fallback_line = vim.api.nvim_win_get_cursor(win)[1]
    end
  end

  if not acquire {
    op = opts.op,
    label = opts.label,
    target = opts.target,
    cursor_target = opts.cursor_target,
    status = status,
  } then
    return false
  end

  local a = require 'neogit.lib.async'
  local notification = require 'neogit.lib.notification'
  local cursor_target = opts.cursor_target or (opts.target and opts.target.name)
  local refresh_event = opts.refresh_event

  a.void(function()
    local ok, err = pcall(opts.work)
    if not ok then
      pcall(function()
        notification.error(('Error during %s: %s'):format(opts.op, tostring(err)))
      end)
    end

    if refresh_event and status.dispatch_refresh then
      pcall(function()
        status:dispatch_refresh(nil, refresh_event)
      end)
    end

    -- Give the refresh a moment to rebuild the buffer, then restore cursor
    -- and release the lock. dispatch_refresh is fire-and-forget; 150ms is
    -- enough for the typical rebuild without feeling laggy.
    vim.defer_fn(function()
      restore_cursor(status, cursor_target, fallback_line)
      release()
    end, 150)
  end)()

  return true
end

-- ─── Operations ────────────────────────────────────────────────────────

function M.checkout_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_branch(self)
  if not item then
    return false
  end

  local event = require 'neogit.lib.event'
  local notification = require 'neogit.lib.notification'
  local git = require 'neogit.lib.git'
  local name = item.branch

  M._run_op {
    op = 'checkout',
    label = ("checking out '%s'"):format(name),
    target = { name = name },
    status = status,
    refresh_event = 'branch_checkout',
    work = function()
      local r = git.branch.checkout(name)
      if r and r.code == 0 then
        notification.info(("Checked out '%s'"):format(name))
        event.send('BranchCheckout', { branch_name = name })
        -- Neogit's pushRemote_ref() resolves through git.repo.state.head.branch
        -- (the live state), so we have to update it before the refresh
        -- otherwise the new state inherits the previous branch's pushRemote.
        if git.repo and git.repo.state and git.repo.state.head then
          git.repo.state.head.branch = name
        end
      else
        notification.error(("Failed to checkout '%s'"):format(name))
      end
    end,
  }
  return true
end

function M.delete_branch_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_branch(self)
  if not item then
    return false
  end

  local notification = require 'neogit.lib.notification'
  if item.is_head then
    notification.warn 'Cannot delete the currently checked-out branch'
    return true
  end

  local name = item.branch

  -- Single-key confirm (see local `confirm` above): noice strips prompts from
  -- vim.fn.confirm dialogs, and we bypass neogit.lib.git.branch.delete because
  -- its built-in unmerged prompt is also eaten by noice.
  if not confirm(("Delete branch '%s'?"):format(name)) then
    return true
  end

  if git_branch_is_unmerged(name) then
    if not confirm(("'%s' is not fully merged. Force delete?"):format(name)) then
      return true
    end
    M._delete_branch(status, name, true)
  else
    M._delete_branch(status, name, false)
  end
  return true
end

function M._delete_branch(status, name, force)
  local notification = require 'neogit.lib.notification'

  M._run_op {
    op = 'delete',
    label = ("deleting '%s'"):format(name),
    target = { name = name },
    -- Branch will be gone after refresh; cursor falls back to original line.
    cursor_target = nil,
    status = status,
    refresh_event = 'branch_delete',
    work = function()
      local ok, stderr = git_delete_branch(name, force)
      if ok then
        notification.info(("Deleted '%s'"):format(name))
      elseif stderr ~= '' then
        notification.error(("Failed to delete '%s': %s"):format(name, stderr))
      else
        notification.error(("Failed to delete '%s'"):format(name))
      end
    end,
  }
  return true
end

function M.drop_commit_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_commit(self)
  if not item then
    return false
  end

  local oid = item.commit.oid
  local abbrev = item.commit.abbreviated_commit or short_oid(oid)
  local subject = item.commit.subject or ''
  local prompt = ('Drop commit %s "%s"?'):format(abbrev, subject)

  local input = require 'neogit.lib.input'
  if not input.get_confirmation(prompt, { values = { '&Yes', '&No' }, default = 2 }) then
    return true
  end

  local notification = require 'neogit.lib.notification'
  local git = require 'neogit.lib.git'

  local win = vim.api.nvim_get_current_win()
  local line_here = vim.api.nvim_win_get_cursor(win)[1]

  M._run_op {
    op = 'drop',
    label = ('dropping %s'):format(abbrev),
    target = { line = line_here },
    status = status,
    refresh_event = 'commit_drop',
    work = function()
      local r = git.rebase.drop(oid)
      if r and r.code == 0 then
        notification.info(('Dropped %s'):format(abbrev))
      else
        notification.error(('Failed to drop %s — rebase may be in progress'):format(abbrev))
      end
    end,
  }
  return true
end

function M.reset_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_commit(self)
  if not item then
    return false
  end

  local ok_menu, Menu = pcall(require, 'nui.menu')
  if not ok_menu then
    pcall(function()
      require('neogit.lib.notification').error 'nui.menu not available'
    end)
    return true
  end

  local oid = item.commit.oid
  local abbrev = item.commit.abbreviated_commit or short_oid(oid)

  local win = vim.api.nvim_get_current_win()
  local line_here = vim.api.nvim_win_get_cursor(win)[1]

  local menu = Menu({
    position = '50%',
    size = { width = 32, height = 3 },
    relative = 'editor',
    border = {
      style = 'rounded',
      text = { top = (' Reset to %s '):format(abbrev), top_align = 'center' },
    },
    win_options = {
      winhighlight = 'Normal:Normal,FloatBorder:FloatBorder,CursorLine:PmenuSel',
    },
  }, {
    lines = {
      Menu.item 'mixed',
      Menu.item 'soft',
      Menu.item 'hard',
    },
    keymap = {
      focus_next = { 'j', '<Down>', '<Tab>' },
      focus_prev = { 'k', '<Up>', '<S-Tab>' },
      close = { '<Esc>', '<C-c>', 'q' },
      submit = { '<CR>', '<Space>' },
    },
    on_submit = function(choice_item)
      local choice = choice_item.text
      if not choice then
        return
      end

      local notification = require 'neogit.lib.notification'
      local git = require 'neogit.lib.git'

      M._run_op {
        op = 'reset',
        label = ('resetting --%s to %s'):format(choice, abbrev),
        target = { line = line_here },
        status = status,
        refresh_event = 'reset',
        work = function()
          if git.reset[choice](oid) then
            notification.info(('Reset --%s to %s'):format(choice, abbrev))
          else
            notification.error(('Reset --%s to %s failed'):format(choice, abbrev))
          end
        end,
      }
    end,
  })

  menu:mount()
  return true
end

function M.revert_commit_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_commit(self)
  if not item then
    return false
  end

  local oid = item.commit.oid
  local abbrev = item.commit.abbreviated_commit or short_oid(oid)
  local subject = item.commit.subject or ''

  local notification = require 'neogit.lib.notification'
  local git = require 'neogit.lib.git'

  local win = vim.api.nvim_get_current_win()
  local line_here = vim.api.nvim_win_get_cursor(win)[1]

  M._run_op {
    op = 'revert',
    label = ('reverting %s'):format(abbrev),
    target = { line = line_here },
    status = status,
    refresh_event = 'commit_revert',
    work = function()
      local ok, msg = git.revert.commits({ oid }, {})
      if not ok then
        notification.error(('Revert failed: %s'):format(msg or 'unknown error'))
        return
      end
      local commit_result = git.cli.commit.no_verify.no_edit.call()
      if commit_result and commit_result.code == 0 then
        notification.info(('Reverted %s "%s"'):format(abbrev, subject))
      else
        notification.error(('Revert staged but commit failed for %s'):format(abbrev))
      end
    end,
  }
  return true
end

function M.new_branch_under_cursor(self)
  if M.is_busy() then
    busy_warn()
    return true
  end

  local item, status = cursor_branch(self)
  if not item then
    return false
  end

  local base = item.branch
  local event = require 'neogit.lib.event'
  local notification = require 'neogit.lib.notification'
  local git = require 'neogit.lib.git'

  -- vim.ui.input directly (not neogit.lib.input.get_user_input, which is
  -- async-wrapped and only valid inside an a.void coroutine — keymap
  -- callbacks run synchronously, so the wrap errors and pcall swallows it).
  vim.ui.input({ prompt = ("Create branch starting at '%s': "):format(base) }, function(raw)
    if not raw or raw == '' then
      return
    end
    local name = raw:gsub('%s+', '-')

    M._run_op {
      op = 'new_branch',
      label = ("creating '%s' from '%s'"):format(name, base),
      target = { name = base },       -- spinner stays on base row during creation
      cursor_target = name,            -- cursor lands on the new branch after refresh
      status = status,
      refresh_event = 'branch_create',
      work = function()
        if not git.branch.create(name, base) then
          notification.warn(("Branch '%s' already exists"):format(name))
          return
        end
        event.send('BranchCreate', { branch_name = name, base = base })

        local r = git.branch.checkout(name)
        if r and r.code == 0 then
          notification.info(("Created and checked out '%s'"):format(name))
          event.send('BranchCheckout', { branch_name = name })
          if git.repo and git.repo.state and git.repo.state.head then
            git.repo.state.head.branch = name
          end
        else
          notification.error(("Created '%s' but failed to check it out"):format(name))
        end
      end,
    }
  end)
  return true
end

function M.d_under_cursor(self)
  if M.delete_branch_under_cursor(self) then
    return
  end
  if M.drop_commit_under_cursor(self) then
    return
  end
  -- Fall through to Neogit's Discard for file/hunk/section rows.
  local status = active_status(self)
  if not status then
    return
  end
  local ok, actions = pcall(require, 'neogit.buffers.status.actions')
  if not ok or type(actions.n_discard) ~= 'function' then
    return
  end
  local handler = actions.n_discard(status)
  if type(handler) == 'function' then
    handler()
  end
end

function M.v_discard_under_cursor(self)
  local status = active_status(self)
  if not status then
    return
  end
  local ok, actions = pcall(require, 'neogit.buffers.status.actions')
  if not ok or type(actions.v_discard) ~= 'function' then
    return
  end
  local handler = actions.v_discard(status)
  if type(handler) == 'function' then
    handler()
  end
end

local installed = false

function M.setup()
  if installed then
    return
  end
  installed = true

  pcall(function()
    require('config.neogit_preview').setup()
  end)

  -- Route Neogit's confirm prompts through vim.fn.input (cmdline) instead of
  -- vim.fn.confirm: noice has messages disabled, which strips the prompt text
  -- from confirm dialogs (only "[Y/n]:" renders), causing every confirmation
  -- to silently default and bail. This breaks Discard on untracked files,
  -- the unmerged-branch delete prompt, and any other neogit get_permission /
  -- get_confirmation call site.
  pcall(function()
    local input = require 'neogit.lib.input'
    input.get_confirmation = function(msg, _opts)
      return confirm(msg)
    end
    input.get_permission = function(msg, _opts)
      return confirm(msg)
    end
  end)

  -- Neogit's cleanup_items (used by Discard for untracked items) calls
  -- vim.fn.delete(path) without flags, which refuses to delete directories.
  -- Untracked dirs therefore silently survive discard. cleanup_items is a
  -- module-local; patch the shared upvalue used by the exported discard
  -- actions so every caller picks up the dir-aware behavior.
  pcall(function()
    local actions = require 'neogit.buffers.status.actions'

    local function cleanup_items(items)
      if vim.in_fast_event() then
        require('neogit.lib.async').util.scheduler()
      end
      for _, item in ipairs(items) do
        local path = item.absolute_path or item.name
        if path then
          local bufnr = vim.fn.bufnr(path)
          if bufnr > 0 then
            pcall(vim.api.nvim_buf_delete, bufnr, { force = false })
          end
          if vim.fn.isdirectory(path) == 1 then
            vim.fn.delete(path, 'rf')
          else
            vim.fn.delete(vim.fn.fnameescape(path))
          end
        end
      end
    end

    local function patch_upvalue(fn, name, replacement)
      if type(fn) ~= 'function' then
        return false
      end
      for i = 1, 200 do
        local n = debug.getupvalue(fn, i)
        if not n then
          return false
        end
        if n == name then
          debug.setupvalue(fn, i, replacement)
          return true
        end
      end
      return false
    end

    -- Both discard actions share the same module-level cleanup_items upvalue,
    -- so patching it on either closure propagates to every other call site
    -- in actions.lua that references the same local.
    patch_upvalue(actions.v_discard, 'cleanup_items', cleanup_items)
    patch_upvalue(actions.n_discard, 'cleanup_items', cleanup_items)
  end)

  local status_ui = require 'neogit.buffers.status.ui'
  local original_status = status_ui.Status
  -- Insert the branches section just before stashes / unmerged / recent commits.
  local insert_before = {
    stashes = true,
    upstream_unmerged = true,
    pushRemote_unmerged = true,
    recent = true,
    upstream_unpulled = true,
    pushRemote_unpulled = true,
  }
  status_ui.Status = function(state, config)
    local tree = original_status(state, config)
    local list = tree and tree[1]
    if list and list.children then
      -- Move recent commits above stashes and default it unfolded. Run before
      -- the branches insertion so the insert_before lookup uses the new order.
      local recent_idx, stashes_idx
      for i, child in ipairs(list.children) do
        local name = child.options and child.options.section
        if name == 'recent' then
          recent_idx = i
        elseif name == 'stashes' then
          stashes_idx = i
        end
      end
      if recent_idx then
        local recent_node = list.children[recent_idx]
        if recent_node.options then
          recent_node.options.folded = false
        end
        if stashes_idx and recent_idx > stashes_idx then
          table.remove(list.children, recent_idx)
          table.insert(list.children, stashes_idx, recent_node)
        end
      end

      local ok, section = pcall(build_section)
      if ok and section then
        local index
        for i, child in ipairs(list.children) do
          if child.options and insert_before[child.options.section] then
            index = i
            break
          end
        end
        table.insert(list.children, index or (#list.children + 1), section)
      end
    end
    return tree
  end

  local actions = require 'neogit.buffers.status.actions'
  local original_goto = actions.n_goto_file
  actions.n_goto_file = function(self)
    local fallthrough = original_goto(self)
    return function()
      if M.checkout_under_cursor(self) then
        return
      end
      fallthrough()
    end
  end

  -- Restore standard Vim visual mode in Neogit views. Default Neogit binds
  -- `v` (in normal mode) to RevertPopup via mappings.popup; we want it to
  -- enter character-wise visual mode for text selection.
  vim.api.nvim_create_autocmd('FileType', {
    pattern = 'Neogit*',
    callback = function(args)
      vim.schedule(function()
        if vim.api.nvim_buf_is_valid(args.buf) then
          pcall(vim.keymap.del, 'n', 'v', { buffer = args.buf })
        end
      end)
    end,
  })

  -- Override Neogit's default `d` (DiffPopup) and `t` (TagPopup) on the
  -- status buffer. Neogit sets these AFTER user_mappings.status, so we
  -- bind ours on FileType + vim.schedule to land last.
  vim.api.nvim_create_autocmd('FileType', {
    pattern = 'NeogitStatus',
    callback = function(args)
      vim.schedule(function()
        if not vim.api.nvim_buf_is_valid(args.buf) then
          return
        end
        local opts = { buffer = args.buf, silent = true, nowait = true }
        vim.keymap.set('n', '<space>', function()
          M.checkout_under_cursor()
        end, opts)
        vim.keymap.set('n', 'd', function()
          M.d_under_cursor()
        end, opts)
        vim.keymap.set('x', 'd', function()
          -- v_discard reads line("v") / line(".") so the selection must be
          -- captured before we leave visual mode.
          M.v_discard_under_cursor()
        end, opts)
        vim.keymap.set('n', 't', function()
          M.revert_commit_under_cursor()
        end, opts)
        vim.keymap.set('n', 'n', function()
          M.new_branch_under_cursor()
        end, opts)
        vim.keymap.set('n', 'r', function()
          M.reset_under_cursor()
        end, opts)
      end)
    end,
  })
end

return M
