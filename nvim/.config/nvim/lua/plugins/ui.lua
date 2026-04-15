return {
  {
    'nvim-lualine/lualine.nvim',
    event = 'UIEnter',
    dependencies = {
      'nvim-tree/nvim-web-devicons',
    },
    opts = function()
      local lazy_status = require 'lazy.status'

      local function wide_enough()
        return vim.fn.winwidth(0) > 100
      end

      local function macro_recording()
        local register = vim.fn.reg_recording()
        if register == '' then
          return ''
        end

        return ' @' .. register
      end

      local function search_count()
        if vim.v.hlsearch == 0 then
          return ''
        end

        local ok, result = pcall(vim.fn.searchcount, {
          maxcount = 999,
          recompute = 1,
        })
        if not ok or not result or result.total == 0 then
          return ''
        end

        return string.format(' %d/%d', result.current, result.total)
      end

      local mode_names = {
        ['NORMAL'] = 'NORMAL',
        ['O-PENDING'] = 'OP',
        ['INSERT'] = 'INSERT',
        ['VISUAL'] = 'VISUAL',
        ['V-BLOCK'] = 'V-BLOCK',
        ['V-LINE'] = 'V-LINE',
        ['V-REPLACE'] = 'V-REPLACE',
        ['REPLACE'] = 'REPLACE',
        ['COMMAND'] = 'COMMAND',
        ['EX'] = 'EX',
        ['MORE'] = 'MORE',
        ['CONFIRM'] = 'CONFIRM',
        ['SHELL'] = 'SHELL',
        ['TERMINAL'] = 'TERMINAL',
        ['SELECT'] = 'SELECT',
        ['S-LINE'] = 'S-LINE',
        ['S-BLOCK'] = 'S-BLOCK',
      }

      return {
        options = {
          theme = 'tokyonight',
          globalstatus = true,
          component_separators = {
            left = '│',
            right = '│',
          },
          section_separators = {
            left = '',
            right = '',
          },
          disabled_filetypes = {
            statusline = {
              'alpha',
              'dashboard',
              'starter',
            },
          },
        },
        sections = {
          lualine_a = {
            {
              'mode',
              fmt = function(str)
                return ' ' .. (mode_names[str] or str)
              end,
            },
          },
          lualine_b = {
            {
              'branch',
              icon = '',
            },
            {
              'diff',
              symbols = {
                added = ' ',
                modified = ' ',
                removed = ' ',
              },
            },
          },
          lualine_c = {
            {
              'diagnostics',
              sources = { 'nvim_diagnostic' },
              symbols = {
                error = ' ',
                warn = ' ',
                info = ' ',
                hint = ' ',
              },
            },
            {
              'filename',
              path = 1,
              symbols = {
                modified = ' ●',
                readonly = ' ',
                unnamed = '[No Name]',
                newfile = '[New]',
              },
            },
          },
          lualine_x = {
            {
              macro_recording,
              color = {
                fg = '#ff9e64',
              },
            },
            {
              search_count,
              cond = wide_enough,
            },
            {
              function()
                return lazy_status.updates()
              end,
              cond = lazy_status.has_updates,
              color = {
                fg = '#e0af68',
              },
            },
            {
              'filetype',
              colored = true,
              icon_only = false,
            },
            {
              'fileformat',
              cond = wide_enough,
              symbols = {
                unix = 'LF',
                dos = 'CRLF',
                mac = 'CR',
              },
            },
          },
          lualine_y = {
            {
              'progress',
            },
          },
          lualine_z = {
            {
              'location',
            },
          },
        },
        inactive_sections = {
          lualine_a = {},
          lualine_b = {},
          lualine_c = {
            {
              'filename',
              path = 1,
            },
          },
          lualine_x = {
            {
              'location',
            },
          },
          lualine_y = {},
          lualine_z = {},
        },
        extensions = {
          'neo-tree',
          'quickfix',
        },
      }
    end,
  },
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
  {
    'rachartier/tiny-inline-diagnostic.nvim',
    event = 'VeryLazy',
    priority = 1000,
    config = function()
      require('tiny-inline-diagnostic').setup {
        preset = 'modern',
        options = {
          show_source = {
            enabled = true,
            if_many = false,
          },
          softwrap = 40,
          multilines = {
            enabled = true,
            trim_whitespaces = true,
          },
          show_all_diags_on_cursorline = true,
          enable_on_insert = false,
          overflow = {
            mode = 'wrap',
            padding = 4,
          },
          show_code = true,
          override_open_float = true,
        },
      }
    end,
  },
}
