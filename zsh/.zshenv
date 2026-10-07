. "$HOME/.cargo/env"

# Load secrets for all shells (needed for tools launched non-interactively)
if [[ -r "$HOME/.config/zsh/zshrc.d/99-secrets.zsh" ]]; then
  source "$HOME/.config/zsh/zshrc.d/99-secrets.zsh"
fi

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
