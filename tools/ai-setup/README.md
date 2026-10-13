# AI tooling for Claude Code

Local setup for working on this site with Claude Code. None of it ships with the
site, and none of it runs in Claude Code cloud sessions: it's for your own machine.

| Tool | What it does | Where it runs |
| --- | --- | --- |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute) | AI gateway: one endpoint in front of many providers, with fallback chains ("combos") | `localhost:20128` (dashboard and API) |
| [Headroom](https://github.com/chopratejas/headroom) | Compresses tool output and context before it reaches the model | `localhost:8787` (proxy) |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Remembers past sessions and feeds the relevant parts into new ones | Claude Code plugin; viewer at `localhost:37777` |
| `claude-routed` | Starts Claude Code with requests going through both proxies | `~/.local/bin` |

```
claude-routed
   │
   ▼
Claude Code ──▶ Headroom :8787 ──▶ OmniRoute :20128 ──▶ providers you connected
                (compression)       (routing, fallbacks)
```

Plain `claude` is never rerouted. It still talks to Anthropic directly, so it's
always there as a fallback.

## Install

Needs Node.js 20+, [uv](https://docs.astral.sh/uv/) and Claude Code.

```bash
./tools/ai-setup/setup.sh
```

The script is safe to re-run. When it finishes:

1. **Connect a provider.** Run `omniroute`, open http://localhost:20128, go to
   **Providers**, and add an API key or sign in to an account.
2. **Add your OmniRoute key.** Copy it from **Dashboard → Endpoints** into
   `~/.config/claude-routed/env`. That file is `chmod 600` and lives outside the
   repo; don't put the key anywhere in this repo.
3. **Launch** with `claude-routed`. It starts OmniRoute in the background if it
   isn't already running.

## Verify the chain

```bash
# OmniRoute answers with your key
curl -s http://localhost:20128/v1/models -H "Authorization: Bearer $OMNIROUTE_API_KEY" | head

# A one-shot prompt through both proxies
claude-routed -p "reply with OK"

# Token savings so far
headroom savings
```

While a `claude-routed` session is running, requests should show up in both
OmniRoute's dashboard (**Usage**) and Headroom's log. If they reach OmniRoute but
not Headroom, something outside the launcher has set `ANTHROPIC_BASE_URL`. Check
`~/.claude/settings.json` and your shell profile.

## Configuration

`~/.config/claude-routed/env`, copied from [`env.example`](env.example):

| Setting | Default | |
| --- | --- | --- |
| `OMNIROUTE_API_KEY` | none | Required |
| `OMNIROUTE_URL` | `http://127.0.0.1:20128` | Point it at a remote OmniRoute if you run one |
| `HEADROOM_PORT` | `8787` | |
| `HEADROOM_WRAP_FLAGS` | empty | Extra flags for `headroom wrap claude`, such as `--1m` |
| `HEADROOM_BEACON`, `CLAUDE_MEM_TELEMETRY` | off | Anonymous telemetry. The setup turns both off; delete the lines to opt back in |

**Choosing models.** Pick a model with `/model` inside the session, or pass one
directly, such as `claude-routed --model auto`. OmniRoute's model ids look like
`provider/model`. To show non-Claude models in the `/model` picker, turn on
**Expose in Claude Code** for that provider in OmniRoute's dashboard. For a model
whose context window isn't 200K, set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` a little
below its real window, or auto-compaction fires at the wrong point.

**claude-mem** keeps its settings in `~/.claude-mem/settings.json`. It's
installed with `--provider claude`, so memories stay on your machine and are
summarised by your own Claude plan. Its background worker inherits the routing of
whichever session started it, so once a `claude-routed` session starts it, the
summaries go through OmniRoute too. Wrap anything you don't want stored in
`<private>…</private>`.

## Things to know

- **Two compressors.** OmniRoute has its own compression (RTK and Caveman) as
  well as Headroom's. Content compressed twice saves little extra and is harder
  to debug. If responses look wrong, turn off OmniRoute's compression in its
  dashboard first.
- **Two memories.** Headroom's `--memory` flag and claude-mem both inject past
  context. Use one of them, not both. The default config uses claude-mem.
- **Provider terms.** OmniRoute can sign in to consumer subscriptions and free
  tiers. Some providers don't allow that kind of use, and OmniRoute marks those
  `tos: avoid`. Check each provider's terms before you connect it. That includes
  routing a Claude subscription through anything other than Claude Code itself.
- **Trust.** Everything you send Claude Code goes through OmniRoute, which also
  holds your provider credentials. Keep it on `127.0.0.1`, don't expose port
  20128, and keep it updated (`npm update -g omniroute`). The project has drawn
  published security criticism, so read its open security issues before you
  route sensitive work through it.
- **Cloud sessions.** Claude Code on the web runs in a fresh container that
  can't reach your localhost, so none of this applies there. The committed
  `.claude/settings.json` deliberately contains no proxy settings.

## Undo

```bash
headroom unwrap claude                     # removes anything Headroom wrote to Claude settings
uv tool uninstall headroom-ai
npm uninstall -g omniroute                 # its data is in ~/.omniroute
claude plugin uninstall claude-mem@thedotmack  # its data is in ~/.claude-mem
rm ~/.local/bin/claude-routed
rm -r ~/.config/claude-routed
```
