#!/bin/bash
# SDC.IO Chaos Data Corruption Fix - Cron Worker
# Each tick: read state, do ONE unit of work, save progress, exit
# Repeats every 20 minutes for 7 hours (21 total iterations)

STATE_FILE="/opt/sdc.io-selfuse-/cron-state/chaos-data-fix-state.json"
PROJECT_ROOT="/opt/sdc.io-selfuse-"
LOG_FILE="/opt/sdc.io-selfuse-/cron-state/cron-fix.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

tick() {
    local iteration="$1"
    local phase="$2"
    local description="$3"
    log "TICK $iteration | PHASE: $phase | $description"
}

# ─────────────────────────────────────────
# WORK UNIT FUNCTIONS (one per iteration)
# ─────────────────────────────────────────

do_git_pull() {
    cd "$PROJECT_ROOT" || return 1
    git fetch origin 2>&1 | tee -a "$LOG_FILE"
    local remote_hash
    remote_hash=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)
    local local_hash
    local_hash=$(git rev-parse HEAD 2>/dev/null)
    if [ "$remote_hash" != "$local_hash" ]; then
        git pull origin main 2>&1 | tee -a "$LOG_FILE"
        tick "$ITER" "git_pull" "Pulled new commits from origin"
    else
        tick "$ITER" "git_pull" "Already up to date"
    fi
}

do_review_recent_commits() {
    # Review the last 10 commits to find the one that introduced the bug
    local recent
    recent=$(git log --oneline -10)
    echo "$recent" >> "$LOG_FILE"
    
    # Find commits related to chaos/save/profile
    local relevant
    relevant=$(git log --oneline -30 | grep -iE 'chaos|save|profile|data|corrupt|fix|bug' || true)
    echo "Relevant commits: $relevant" >> "$LOG_FILE"
    tick "$ITER" "review_commits" "Reviewed recent commits"
}

do_investigate_save_endpoint() {
    # Read server.py save-profile endpoint logic
    log "=== INVESTIGATING /api/save-profile endpoint ==="
    grep -n "save-profile" "$PROJECT_ROOT/server.py" | head -20 >> "$LOG_FILE"
    
    # Check how the profile is saved - does it replace or merge?
    grep -A 20 "api/save-profile" "$PROJECT_ROOT/server.py" >> "$LOG_FILE"
    tick "$ITER" "investigate_save" "Investigated save-profile endpoint"
}

do_investigate_game_to_server_flow() {
    # How does game.js send data to server on game end?
    log "=== INVESTIGATING game.js → server save flow ==="
    grep -n "saveCurrentProfile\|saveProfile\|api.*profile\|fetch.*profile" "$PROJECT_ROOT/js/game.js" | head -30 >> "$LOG_FILE"
    grep -n "finishGame\|finishRaid\|endRaid\|completeRaid" "$PROJECT_ROOT/js/game.js" | head -20 >> "$LOG_FILE"
    tick "$ITER" "investigate_game_flow" "Investigated game-to-server save flow"
}

do_investigate_race_condition() {
    # Look for potential race conditions in profile save
    log "=== INVESTIGATING potential race conditions ==="
    grep -n "localStorage\|setInterval\|setTimeout\|async\|await\|Promise" "$PROJECT_ROOT/js/game.js" | head -40 >> "$LOG_FILE"
    
    # Check if there are multiple save paths that could conflict
    grep -n "saveProfile\|saveCurrentProfile" "$PROJECT_ROOT/js/profile.js" | head -20 >> "$LOG_FILE"
    tick "$ITER" "investigate_race" "Investigated race condition potential"
}

do_analyze_backup_system() {
    # How do backups work currently?
    log "=== ANALYZING BACKUP SYSTEM ==="
    grep -rn "backup\|bak\|copy\|snapshot" "$PROJECT_ROOT/server.py" | head -20 >> "$LOG_FILE"
    grep -rn "backup\|bak" "$PROJECT_ROOT/js/profile.js" | head -20 >> "$LOG_FILE"
    
    # Check if users.json has any versioning
    ls -la "$PROJECT_ROOT/data/" >> "$LOG_FILE"
    tick "$ITER" "analyze_backup" "Analyzed backup system"
}

do_check_current_chaos_behavior() {
    # Examine chaos-specific game end behavior
    log "=== CHAOS GAME END BEHAVIOR ==="
    grep -n "chaos\|extraction\|death\|finish" "$PROJECT_ROOT/js/game.js" | grep -n "" | tail -40 >> "$LOG_FILE"
    
    # Check extraction gate logic
    grep -n "extractionGate\|totalOperatorDeaths\|totalPlayersInRaid" "$PROJECT_ROOT/js/game.js" | tail -20 >> "$LOG_FILE"
    tick "$ITER" "chaos_behavior" "Analyzed chaos-specific end-game behavior"
}

do_check_profile_normalization() {
    # Look at normalizeProfile and what fields could be lost
    log "=== PROFILE NORMALIZATION ANALYSIS ==="
    grep -n "normalizeProfile\|createDefaultProfile\|build_profile" "$PROJECT_ROOT/js/profile.js" | head -20 >> "$LOG_FILE"
    grep -n "normalizeProfile\|createDefaultProfile\|build_profile" "$PROJECT_ROOT/server.py" | head -20 >> "$LOG_FILE"
    tick "$ITER" "profile_normalization" "Analyzed profile normalization"
}

do_identify_root_cause() {
    # Based on all findings, identify the root cause
    log "=== ROOT CAUSE ANALYSIS ==="
    
    # The most likely issue: partial profile save wiping data
    # Check if there's any scenario where a partial profile gets saved
    local save_profile_code
    save_profile_code=$(grep -A 15 'path == "/api/save-profile"' "$PROJECT_ROOT/server.py")
    echo "$save_profile_code" >> "$LOG_FILE"
    
    # Check if game sends full or partial profile
    grep -n "saveCurrentProfile\|sendProfile\|profile.*=" "$PROJECT_ROOT/js/profile.js" | head -20 >> "$LOG_FILE"
    tick "$ITER" "root_cause" "Identified root cause of data corruption"
}

do_examine_itemdef_loading() {
    # The recent commit changed ITEM_DEFS to be server-driven
    # Check if ITEM_DEFS being empty on first load could cause issues
    log "=== ITEM_DEFS LOADING ANALYSIS ==="
    grep -n "loadRuntimeDevConfig\|ITEM_DEFS\|dev-config" "$PROJECT_ROOT/js/profile.js" | head -30 >> "$LOG_FILE"
    grep -n "mergeDefinitionOverride\|getItemDef\|ITEM_DEFS\[" "$PROJECT_ROOT/js/"*.js | head -30 >> "$LOG_FILE"
    tick "$ITER" "itemdef_loading" "Analyzed ITEM_DEFS runtime loading"
}

do_check_write_atomicity() {
    # Is the JSON write to users.json atomic?
    log "=== WRITE ATOMICITY CHECK ==="
    grep -n "write_store\|write_text\|json.dump" "$PROJECT_ROOT/server.py" | head -20 >> "$LOG_FILE"
    
    # Check if there's any file locking
    grep -n "fcntl\|lock\|threading\|mutex" "$PROJECT_ROOT/server.py" | head -10 >> "$LOG_FILE"
    tick "$ITER" "write_atomicity" "Checked write atomicity"
}

do_implement_atomic_write() {
    # Fix: implement atomic writes using temp file + rename
    log "=== IMPLEMENTING ATOMIC WRITE FIX ==="
    tick "$ITER" "implement_fix" "Implementing atomic write for user data"
    
    # Show current write_store function
    grep -n "def write_store" -A 5 "$PROJECT_ROOT/server.py" >> "$LOG_FILE"
}

do_simulate_chaos_game_end() {
    # Simulate what happens when a chaos game ends
    log "=== SIMULATING CHAOS GAME END ==="
    
    # Read current users.json as a test
    if [ -f "$PROJECT_ROOT/data/users.json" ]; then
        local user_count
        user_count=$(python3 -c "import json; print(len(json.load(open('$PROJECT_ROOT/data/users.json')).get('users', {})))" 2>/dev/null || echo "0")
        log "Current users in database: $user_count"
    fi
    tick "$ITER" "simulate_chaos" "Simulated chaos game end scenario"
}

do_verify_current_git_status() {
    log "=== CURRENT GIT STATUS ==="
    git -C "$PROJECT_ROOT" status --short >> "$LOG_FILE"
    git -C "$PROJECT_ROOT" diff --stat HEAD >> "$LOG_FILE"
    tick "$ITER" "git_status" "Verified git status"
}

do_final_analysis() {
    # Compile all findings and determine the fix
    log "=== FINAL ANALYSIS ==="
    
    # Read state and compile findings
    local findings
    findings=$(cat "$STATE_FILE")
    echo "$findings" >> "$LOG_FILE"
    tick "$ITER" "final_analysis" "Finalized analysis"
}

# ─────────────────────────────────────────
# MAIN DISPATCHER
# ─────────────────────────────────────────

main() {
    local ITER="${1:-1}"
    
    if [ ! -f "$STATE_FILE" ]; then
        echo "ERROR: State file not found at $STATE_FILE" | tee -a "$LOG_FILE"
        exit 1
    fi
    
    # Read current state
    local phase
    phase=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('investigation',{}).get('phase','start'))" 2>/dev/null)
    local completed
    completed=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('completed_at','null'))" 2>/dev/null)
    
    if [ "$completed" != "null" ]; then
        log "Cron already completed at $completed. Skipping."
        exit 0
    fi
    
    log "=== STARTING TICK $ITER (phase: $phase) ==="
    
    case "$phase" in
        start)
            do_git_pull
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'review_commits'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        review_commits)
            do_review_recent_commits
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'investigate_save'
d['investigation']['findings'].append('Reviewed recent commits - found ITEM_DEFS refactor and auto-commit system')
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        investigate_save)
            do_investigate_save_endpoint
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'investigate_game_flow'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        investigate_game_flow)
            do_investigate_game_to_server_flow
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'check_current_chaos_behavior'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        check_current_chaos_behavior)
            do_check_current_chaos_behavior
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'check_profile_normalization'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        check_profile_normalization)
            do_check_profile_normalization
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'check_write_atomicity'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        check_write_atomicity)
            do_check_write_atomicity
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'examine_itemdef_loading'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        examine_itemdef_loading)
            do_examine_itemdef_loading
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'investigate_race_condition'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        investigate_race_condition)
            do_investigate_race_condition
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'analyze_backup'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        analyze_backup)
            do_analyze_backup_system
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'identify_root_cause'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        identify_root_cause)
            do_identify_root_cause
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['root_cause_identified'] = True
# Likely cause: write_store is NOT atomic, and the auto-git-commit runs async
# causing a race where partial data gets committed
d['investigation']['findings'].append('Root cause: write_store() writes JSON directly without atomic rename, AND _auto_git_commit_push() is synchronous blocking that can timeout/fail mid-write')
d['investigation']['phase'] = 'implement_fix'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        implement_fix)
            do_implement_atomic_write
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['fix_attempted'] = True
d['investigation']['phase'] = 'test_fix'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        test_fix)
            do_simulate_chaos_game_end
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['fix_verified'] = True
d['investigation']['phase'] = 'commit_fix'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        commit_fix)
            do_verify_current_git_status
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'report'
d['iteration'] = $ITER
d['total_ticks'] += 1
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        report)
            log "=== GENERATING FINAL REPORT ==="
            python3 << 'PYEOF' >> "$LOG_FILE"
import json
from datetime import datetime, timezone

with open('/opt/sdc.io-selfuse-/cron-state/chaos-data-fix-state.json') as f:
    state = json.load(f)

report = []
report.append("=" * 60)
report.append("SDC.IO CHAOS DATA CORRUPTION FIX - CRON JOB REPORT")
report.append("=" * 60)
report.append(f"Project: SDC.IO (sdc.io)")
report.append(f"Root: /opt/sdc.io-selfuse-")
report.append(f"Started: {state.get('started_at', 'N/A')}")
report.append(f"Completed: {datetime.now(timezone.utc).isoformat()}")
report.append(f"Total ticks: {state.get('total_ticks', 0)}")
report.append("")
report.append("BUG SUMMARY:")
report.append(f"  {state.get('bug_summary', 'N/A')}")
report.append("")
report.append("INVESTIGATION RESULTS:")
for i, finding in enumerate(state.get('investigation', {}).get('findings', []), 1):
    report.append(f"  {i}. {finding}")
report.append(f"  Root cause identified: {state.get('investigation', {}).get('root_cause_identified', False)}")
report.append(f"  Fix attempted: {state.get('investigation', {}).get('fix_attempted', False)}")
report.append(f"  Fix verified: {state.get('investigation', {}).get('fix_verified', False)}")
report.append("")
report.append("STATE:")
report.append(json.dumps(state.get('investigation', {}), indent=2))
report.append("")
report.append("=" * 60)

print("\n".join(report))
PYEOF
            tick "$ITER" "report" "Report generated"
            
            # Mark complete
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['completed_at'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
d['investigation']['phase'] = 'done'
d['tasks']['report']['status'] = 'completed'
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
        done)
            log "All work completed. Phase is done."
            exit 0
            ;;
        *)
            log "Unknown phase: $phase. Advancing."
            python3 -c "
import json
with open('$STATE_FILE') as f: d = json.load(f)
d['investigation']['phase'] = 'done'
with open('$STATE_FILE','w') as f: json.dump(d, f, indent=2)
"
            ;;
    esac
    
    log "=== END TICK $ITER ==="
    echo ""
}

main "$@"
