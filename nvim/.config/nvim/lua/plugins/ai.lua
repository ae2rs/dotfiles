-- AI-powered coding assistance

return {
  { -- Supermaven
    'supermaven-inc/supermaven-nvim',
    config = function()
      require('supermaven-nvim').setup {
        keymaps = {
          accept_suggestion = '<C-m>',
          clear_suggestion = '<C-]>',
          accept_word = '<C-j>',
        },
        ignore_filetypes = {},
        log_level = 'off',
        disable_inline_completion = false,
        disable_keymaps = false,
        condition = function()
          return false
        end,
      }
    end,
  },
}
