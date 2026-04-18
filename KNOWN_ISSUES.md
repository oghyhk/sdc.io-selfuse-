## Persistence fix status

This commit hardens user persistence in `server.py` after Chaos raid completion could wipe `data/users.json` and break leaderboard loading.

What changed:
- serialized reads and writes with a re-entrant lock
- switched store writes to atomic replace
- added a runtime backup fallback file path

What is still unfixed:
- the fix has not yet been verified with a full live Chaos run end-to-end
- if both the primary store and runtime backup become unreadable at the same time, the server still falls back to an empty in-memory default store instead of halting the write path

Operational note:
- untracked local recovery files were intentionally left out of the commit