vim.api.nvim_create_autocmd('TextYankPost', {
  group = vim.api.nvim_create_augroup('scratch-highlight-yank', { clear = true }),
  callback = function()
    vim.hl.on_yank()
  end,
})

vim.api.nvim_create_autocmd('VimEnter', {
  group = vim.api.nvim_create_augroup('scratch-startup-buffer', { clear = true }),
  once = true,
  callback = function(event)
    vim.defer_fn(function()
      if not vim.api.nvim_buf_is_valid(event.buf) then
        return
      end

      local bo = vim.bo[event.buf]
      if bo.buftype ~= '' then
        return
      end

      if vim.api.nvim_buf_get_name(event.buf) ~= '' then
        return
      end

      local lines = vim.api.nvim_buf_get_lines(event.buf, 0, -1, false)
      if #lines == 1 and lines[1] == '' then
        bo.modified = false
      end
    end, 100)
  end,
})
