## Persistence fix status

This commit hardens user persistence in `server.py` after Chaos raid completion could wipe `data/users.json` and break leaderboard loading.

What changed:
- serialized reads and writes with a re-entrant lock
- switched store writes to atomic replace (uuid temp file + os.replace)
- added a runtime backup fallback file path

Fixed in subsequent commit:
- if both the primary store and runtime backup become unreadable, the server now raises RuntimeError instead of silently returning an empty default store (which would cause total data loss on the next write)

What is still unfixed:
- the fix has not yet been verified with a full live Chaos run end-to-end

Operational note:
- untracked local recovery files were intentionally left out of the commit
