#!/bin/sh
# Rebuilds the home of the Namespace devbox `workspace`, then starts rho's
# server. Only /Volumes/devbox survives a stop: /Users/runner comes back as
# the image left it, so everything kept lives in $P and is linked from ~.
# A devbox service runs this on every boot; it is safe to run again.
set -eu
P=/Volumes/devbox/home

# ~/NAME becomes a link to $P/NAME; what the image had there is set aside.
link() {
  target="$P/$1" place="$HOME/$1"
  if [ -L "$place" ] && [ "$(readlink "$place")" = "$target" ]; then return; fi
  mkdir -p "$(dirname "$place")"
  if [ -e "$place" ] || [ -L "$place" ]; then mv "$place" "$place.image"; fi
  ln -s "$target" "$place"
}
for name in perso work dotfiles .cargo .rustup .bun .local/bin .local/share/claude .local/state/rho .config/gh; do
  link "$name"
done

# The laptop's home names the same place here, so a path typed there, such
# as `rho -C ~/perso/rho` expanded by its shell, works on this machine.
[ -e /Users/lucas ] || sudo -n ln -s "$P" /Users/lucas

git config --global include.path "$P/.gitconfig"
hook=". $P/dotfiles/devbox/zshenv"
grep -qxF "$hook" "$HOME/.zshenv" 2>/dev/null || printf '%s\n' "$hook" >>"$HOME/.zshenv"

"$P/.local/bin/stow" --restow --dir "$P/dotfiles" --target "$HOME" rho

exec /bin/zsh -lc 'rho server start'
