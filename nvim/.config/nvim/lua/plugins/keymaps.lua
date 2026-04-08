return {
  {
    'folke/which-key.nvim',
    event = 'VeryLazy',
    opts = function()
      return {
        preset = 'modern',
        delay = 200,
        spec = require('config.keys').which_key_spec(),
      }
    end,
    keys = {
      {
        '<leader>?',
        function()
          require('which-key').show { global = false }
        end,
        desc = 'Buffer local keymaps',
      },
    },
  },
}
