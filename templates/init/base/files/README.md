# Raw files

Files under `files/<agent>/` are copied into that agent's home folder, for example:

| Source | Destination |
|---|---|
| `files/claude/output-styles/concise.md` | `~/.claude/output-styles/concise.md` |
| `files/claude/statusline.sh` | `~/.claude/statusline.sh` |
| `files/codex/hooks.json` | `~/.codex/hooks.json` |
| `files/home/.config/example.txt` | `~/.config/example.txt` |

- A `.tmpl` suffix renders `{{variables}}` and is removed from the destination name.
- `name@windows.ext`, `name@macos.ext` and `name@linux.ext` are only copied on that OS.
