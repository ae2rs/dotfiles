# Neovim Scratch Rebuild

This branch resets the Neovim config to a minimal `lazy.nvim` bootstrap so the setup can be rebuilt feature by feature.

The source of truth for the rebuild is [`SETUP.md`](./SETUP.md). It documents:

- the goals for the new config
- the full plugin inventory from the old setup
- the current Rust/proto monorepo LSP behavior
- the recommended order for adding features back

The active config is intentionally tiny:

- [`init.lua`](./init.lua)
- [`lua/config/options.lua`](./lua/config/options.lua)
- [`lua/config/keymaps.lua`](./lua/config/keymaps.lua)
- [`lua/config/autocmds.lua`](./lua/config/autocmds.lua)
- [`lua/config/lazy.lua`](./lua/config/lazy.lua)
sudo ln -sf /opt/nvim-linux-x86_64/bin/nvim /usr/local/bin/
```
</details>
<details><summary>Fedora Install Steps</summary>

```
sudo dnf install -y gcc make git ripgrep fd-find unzip neovim
```
</details>

<details><summary>Arch Install Steps</summary>

```
sudo pacman -S --noconfirm --needed gcc make git ripgrep fd unzip neovim
```
</details>
