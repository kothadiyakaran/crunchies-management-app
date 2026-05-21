"""Scan recent transcripts and tally Bash + MCP + Skill tool calls."""

import json
import re
from collections import Counter
from pathlib import Path

TRANSCRIPT_DIR = Path(
    "C:/Users/Karan/.claude/projects/C--Users-Karan-Personal-Claude-Projects-crunchies-management-app"
)


def leading_token(cmd: str) -> str:
    """Return 'first_cmd second_cmd' for things like `git status`, else just the first token."""
    # strip env-var prefixes, sudo, timeout
    cmd = cmd.strip()
    while True:
        m = re.match(r"^(?:[A-Z_]+=\S+\s+|sudo\s+|timeout\s+\S+\s+)", cmd)
        if not m:
            break
        cmd = cmd[m.end():]

    # take up to the first pipe / && / ; / redirection
    cmd = re.split(r"[\|;]|\s&&\s|\s\|\|\s|\s>\s|\s<\s", cmd, maxsplit=1)[0].strip()
    parts = cmd.split()
    if not parts:
        return ""
    first = parts[0]
    # special-cased commands where second token is a meaningful subcommand
    multi_word = {
        "git", "gh", "docker", "kubectl", "npm", "pnpm", "yarn", "bun",
        "cargo", "uv", "supabase", "claude", "vercel", "playwright",
    }
    if first in multi_word and len(parts) > 1:
        return f"{first} {parts[1]}"
    return first


def main() -> None:
    bash_counts: Counter[str] = Counter()
    mcp_counts: Counter[str] = Counter()
    skill_counts: Counter[str] = Counter()

    transcripts = sorted(
        TRANSCRIPT_DIR.glob("*.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:50]

    for tx in transcripts:
        with tx.open(encoding="utf-8", errors="ignore") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = rec.get("message")
                if not isinstance(msg, dict):
                    continue
                content = msg.get("content")
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "tool_use":
                        continue
                    name = block.get("name", "")
                    inp = block.get("input", {}) or {}
                    if name == "Bash":
                        cmd = inp.get("command", "")
                        key = leading_token(cmd)
                        if key:
                            bash_counts[key] += 1
                    elif name == "Skill":
                        skill_counts[inp.get("skill", "")] += 1
                    elif name.startswith("mcp__"):
                        mcp_counts[name] += 1

    def dump(title: str, counter: Counter[str]) -> None:
        print(f"\n=== {title} ===")
        for key, count in counter.most_common(40):
            if count >= 1:
                print(f"  {count:4d}  {key}")

    dump("Bash leading tokens", bash_counts)
    dump("MCP tools", mcp_counts)
    dump("Skill invocations", skill_counts)


if __name__ == "__main__":
    main()
