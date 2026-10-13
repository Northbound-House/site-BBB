#!/usr/bin/env bash
# Installs and wires up the local AI tooling for Claude Code (macOS or Linux):
#
#   OmniRoute   local AI gateway: one endpoint in front of many providers
#   Headroom    context-compression proxy in front of Claude Code
#   claude-mem  persistent memory across Claude Code sessions (plugin)
#   claude-routed  launcher that chains Claude Code → Headroom → OmniRoute
#
# Safe to re-run: each step skips what is already installed.
# Usage: ./tools/ai-setup/setup.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/claude-routed"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\nsetup: %s\n' "$*" >&2; exit 1; }

# --- Prerequisites ---------------------------------------------------------

say "Checking prerequisites"
command -v node >/dev/null || die "Node.js 20+ is required: https://nodejs.org"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 20 )) || die "Node.js 20+ is required (found $(node -v))."
command -v claude >/dev/null || die "Claude Code is required: npm install -g @anthropic-ai/claude-code"
if ! command -v uv >/dev/null; then
  die "uv is required to install Headroom: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi
note "node $(node -v), $(claude --version), uv $(uv --version | awk '{print $2}')"

# --- OmniRoute -------------------------------------------------------------

say "OmniRoute"
if command -v omniroute >/dev/null; then
  note "already installed ($(omniroute --version 2>/dev/null || echo 'version unknown'))"
else
  # npm 11+ blocks install scripts unless allowed; OmniRoute's postinstall
  # prepares its native runtime. If npm names other packages, add them here.
  npm_major="$(npm -v | cut -d. -f1)"
  if (( npm_major >= 11 )); then
    npm install -g --allow-scripts=omniroute,keytar,onnxruntime-node,@parcel/watcher,@swc/core,protobufjs,esbuild omniroute
  else
    npm install -g omniroute
  fi
fi

# --- Headroom --------------------------------------------------------------

say "Headroom"
if command -v headroom >/dev/null; then
  note "already installed — upgrade later with: headroom update"
else
  # [all] includes the code-aware compressor; without it Claude Code
  # sessions get little or no compression.
  uv tool install --python 3.13 "headroom-ai[all]"
  uv tool update-shell >/dev/null 2>&1 || true
fi

# --- claude-mem ------------------------------------------------------------

say "claude-mem"
if [[ -d "$HOME/.claude/plugins/marketplaces/thedotmack" ]]; then
  note "already installed"
else
  # --provider claude keeps memory local and summarises with your own Claude
  # plan. CLAUDE_MEM_ONLINE_OPTIN=false skips the hosted-memory sign-in.
  CLAUDE_MEM_ONLINE_OPTIN=false npx -y claude-mem@latest install --provider claude
fi
npx -y claude-mem@latest telemetry disable >/dev/null 2>&1 || true

# --- Launcher + config -----------------------------------------------------

say "claude-routed launcher"
mkdir -p "$BIN_DIR" "$CONFIG_DIR"
install -m 755 "$HERE/claude-routed" "$BIN_DIR/claude-routed"
note "installed $BIN_DIR/claude-routed"
if [[ -f "$CONFIG_DIR/env" ]]; then
  note "kept existing $CONFIG_DIR/env"
else
  install -m 600 "$HERE/env.example" "$CONFIG_DIR/env"
  note "created $CONFIG_DIR/env (add your OmniRoute key to it)"
fi
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) note "add $BIN_DIR to your PATH, e.g. in ~/.zshrc: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

# --- Next steps ------------------------------------------------------------

say "Done. Three steps left, all in your browser or editor:"
cat <<EOF

  1. Start OmniRoute and connect a provider:
       omniroute            # dashboard at http://localhost:20128
     Dashboard → Providers → add an API key or sign in to a provider.

  2. Copy your OmniRoute key (Dashboard → Endpoints) into:
       $CONFIG_DIR/env

  3. Launch Claude Code through both proxies:
       claude-routed
     claude-mem's viewer is at http://localhost:37777 once a session has run.

  Plain \`claude\` still goes straight to Anthropic. See tools/ai-setup/README.md
  for verifying the chain and undoing any of this.
EOF
