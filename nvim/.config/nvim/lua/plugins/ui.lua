return {
  {
    'j-hui/fidget.nvim',
    opts = {
      progress = {
        suppress_on_insert = false,
        ignore_empty_message = false,
        lsp = {
          progress_ringbuf_size = 128,
        },
        display = {
          done_ttl = 1,
          progress_icon = {
            pattern = 'dots',
            period = 1,
          },
          overrides = {
            rust_analyzer = {
              name = 'rust-analyzer',
            },
          },
          format_message = function(msg)
            local text = msg.message
            if not text or text == '' then
              text = msg.done and 'Completed' or 'Working'
            end

            if type(msg.percentage) == 'number' then
              local width = 8
              local filled = math.floor((math.max(0, math.min(100, msg.percentage)) / 100) * width + 0.5)
              local bar = string.rep('█', filled) .. string.rep('░', width - filled)
              text = string.format('%s %3d%%%% %s', bar, msg.percentage, text)
            elseif type(msg.percentage) == 'string' then
              text = string.format('%s %s', msg.percentage, text)
            end

            return text
          end,
          format_annote = function(msg)
            if type(msg.title) == 'string' and msg.title ~= '' and msg.title ~= msg.message then
              return msg.title
            end
            return nil
          end,
        },
      },
      notification = {
        override_vim_notify = false,
        window = {
          winblend = 0,
          border = 'rounded',
          x_padding = 1,
          y_padding = 1,
        },
      },
    },
  },
}
