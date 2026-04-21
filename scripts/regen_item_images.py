#!/usr/bin/env python3
"""
SDC.IO Item Image Regeneration
Regenerates images for all non-gun items excluding red and legend rarities.
Saves as [itemid]_2nd.png with rarity-matched background colors.
Creates an approval webpage at /opt/sdc.io-selfuse-/scripts/approve.html
"""
import json, os, sys, time, traceback
import requests
from pathlib import Path

# === CONFIG ===
MINIMAX_API_URL = "https://api.minimax.io/v1/image_generation"
MINIMAX_KEY = os.environ.get("MINIMAX_API_KEY", "")
CF_URL = "https://hermesimggen.oghyhk.workers.dev"
CF_AUTH = "Bearer 2598"
CONFIG_PATH = "/opt/sdc.io-selfuse-/data/dev-config.json"
OUTPUT_DIR = "/opt/sdc.io-selfuse-/client/assets/items"
WEBPAGE_PATH = "/opt/sdc.io-selfuse-/scripts/approve.html"
STATE_PATH = "/opt/sdc.io-selfuse-/scripts/regen_state.json"

# Rarity background colors (extracted from gun images)
RARITY_COLORS = {
    "white":  "#FFFFFF",
    "gray":   "#FFFFFF",   # closest match, no gray gun available
    "green":  "#51C536",
    "blue":   "#0CA8DE",
    "purple": "#B29CF7",
    "gold":   "#FCF000",
}

EXCLUDE_RARITIES = {"red", "legend"}
EXCLUDE_CATEGORIES = {"gun"}

# === PROMPT TEMPLATES ===
CATEGORY_PROMPTS = {
    "backpack": (
        "A high-quality game item icon of a {name}, a tactical military backpack "
        "with multiple compartments and MOLLE webbing. Detailed stitching, "
        "realistic fabric texture. Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
    "helmet": (
        "A high-quality game item icon of a {name}, a military combat helmet "
        "with visor or face shield. Detailed metallic and composite materials, "
        "realistic wear marks. Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
    "armor": (
        "A high-quality game item icon of a {name}, a tactical body armor vest "
        "or plate carrier with ballistic panels. Detailed kevlar weave texture, "
        "realistic stitching and buckles. Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
    "shoes": (
        "A high-quality game item icon of a {name}, tactical military boots "
        "with reinforced sole and ankle support. Detailed leather/rubber texture, "
        "realistic lacing. Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
    "consumable": (
        "A high-quality game item icon of a {name}, a medical or survival consumable "
        "item with detailed packaging and labels. Realistic material texture. "
        "Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
    "loot": (
        "A high-quality game item icon of a {name}, a valuable collectible or "
        "resource item with detailed surface and realistic material. "
        "Centered on a solid {bg_color} background. "
        "Top-down 3/4 angle view, no text, no watermark, clean edges."
    ),
}

DEFAULT_PROMPT = (
    "A high-quality game item icon of a {name}, detailed 3D render with "
    "realistic materials and lighting. Centered on a solid {bg_color} background. "
    "Top-down 3/4 angle view, no text, no watermark, clean edges."
)


def build_prompt(item_name, category, bg_color):
    """Build a refined generation prompt for an item."""
    template = CATEGORY_PROMPTS.get(category, DEFAULT_PROMPT)
    return template.format(name=item_name, bg_color=bg_color)


def generate_minimax(prompt):
    """Generate image via MiniMax image-01. Returns (success, image_bytes_or_error)."""
    if not MINIMAX_KEY:
        return False, "No MiniMax API key set"
    try:
        resp = requests.post(
            MINIMAX_API_URL,
            headers={
                "Authorization": f"Bearer {MINIMAX_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "image-01",
                "prompt": prompt,
                "aspect_ratio": "1:1",
                "response_format": "url",
                "n": 1,
                "prompt_optimizer": True
            },
            timeout=120
        )
        data = resp.json()
        base_resp = data.get("base_resp", {})
        if base_resp.get("status_code", 0) != 0:
            return False, f"MiniMax error: {base_resp}"
        url = data["data"]["image_urls"][0]
        img_data = requests.get(url, timeout=60).content
        return True, img_data
    except Exception as e:
        return False, str(e)


def generate_cf(prompt):
    """Generate image via Cloudflare Workers FLUX fallback. Returns (success, image_bytes_or_error)."""
    try:
        resp = requests.post(
            CF_URL,
            headers={"Authorization": CF_AUTH, "Content-Type": "application/json"},
            json={"prompt": prompt, "width": 1024, "height": 1024},
            timeout=120
        )
        if resp.status_code != 200:
            return False, f"CF error: {resp.status_code} {resp.text[:200]}"
        return True, resp.content
    except Exception as e:
        return False, str(e)


def generate_image(prompt):
    """Try MiniMax first, fallback to CF."""
    ok, result = generate_minimax(prompt)
    if ok:
        return True, result
    print(f"  MiniMax failed: {result}, trying CF FLUX...")
    return generate_cf(prompt)


def load_state():
    """Load regeneration progress state."""
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"completed": [], "failed": [], "skipped": []}


def save_state(state):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def build_approval_webpage(items_to_gen, results):
    """Create an approval HTML page."""
    html_items = []
    for item_id, item_data in sorted(items_to_gen.items()):
        name = item_data.get("name", item_id)
        rarity = item_data.get("rarity", "unknown")
        bg_color = RARITY_COLORS.get(rarity, "#888888")
        result = results.get(item_id, {})
        status = result.get("status", "pending")
        img_2nd = f"/assets/items/{item_id}_2nd.png"
        img_orig = item_data.get("image", "")

        html_items.append(f"""
    <div class="item-card" data-id="{item_id}" data-status="{status}">
      <div class="item-header">
        <h3>{name}</h3>
        <span class="rarity-badge" style="background:{bg_color};color:{'#000' if bg_color in ('#FFFFFF','#FCF000','#51C536') else '#fff'}">{rarity}</span>
      </div>
      <div class="images">
        <div class="img-box">
          <div class="img-label">Original</div>
          <img src="{img_orig}" alt="original" onerror="this.parentElement.innerHTML='<div class=img-label>Original</div><span class=no-img>No image</span>'">
        </div>
        <div class="img-box">
          <div class="img-label">New (2nd)</div>
          <img src="{img_2nd}?t={int(time.time())}" alt="new" onerror="this.parentElement.innerHTML='<div class=img-label>New (2nd)</div><span class=no-img>{status}</span>'">
        </div>
      </div>
      <div class="actions">
        <button class="btn-approve" onclick="vote('{item_id}','approve')">Approve</button>
        <button class="btn-deny" onclick="vote('{item_id}','deny')">Deny</button>
      </div>
      <div class="vote-result" id="result-{item_id}"></div>
    </div>""")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SDC.IO Image Approval</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ font-family: 'Segoe UI', system-ui, sans-serif; background:#1a1a2e; color:#eee; padding:20px; }}
  h1 {{ text-align:center; margin-bottom:10px; color:#e94560; }}
  .summary {{ text-align:center; margin-bottom:20px; color:#aaa; }}
  .filter-bar {{ text-align:center; margin-bottom:20px; }}
  .filter-bar button {{ padding:8px 16px; margin:4px; border:none; border-radius:6px; cursor:pointer;
    background:#333; color:#ccc; font-size:14px; }}
  .filter-bar button.active {{ background:#e94560; color:#fff; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); gap:20px; max-width:1400px; margin:0 auto; }}
  .item-card {{ background:#16213e; border-radius:12px; padding:16px; border:1px solid #0f3460; }}
  .item-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }}
  .item-header h3 {{ font-size:16px; }}
  .rarity-badge {{ padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; text-transform:uppercase; }}
  .images {{ display:flex; gap:12px; margin-bottom:12px; }}
  .img-box {{ flex:1; text-align:center; }}
  .img-box img {{ max-width:100%; max-height:160px; border-radius:8px; background:#0a0a1a; }}
  .img-label {{ font-size:12px; color:#888; margin-bottom:4px; }}
  .no-img {{ color:#666; font-style:italic; }}
  .actions {{ display:flex; gap:8px; }}
  .actions button {{ flex:1; padding:10px; border:none; border-radius:8px; cursor:pointer;
    font-size:14px; font-weight:600; transition:all 0.2s; }}
  .btn-approve {{ background:#27ae60; color:#fff; }}
  .btn-approve:hover {{ background:#2ecc71; transform:scale(1.02); }}
  .btn-deny {{ background:#c0392b; color:#fff; }}
  .btn-deny:hover {{ background:#e74c3c; transform:scale(1.02); }}
  .btn-approve:disabled, .btn-deny:disabled {{ opacity:0.4; cursor:default; transform:none; }}
  .vote-result {{ text-align:center; margin-top:8px; font-weight:600; min-height:20px; }}
  .voted-approve {{ color:#2ecc71; }}
  .voted-deny {{ color:#e74c3c; }}
  .hidden {{ display:none !important; }}
</style>
</head>
<body>
<h1>SDC.IO Image Regeneration Approval</h1>
<p class="summary">{len(items_to_gen)} items to review</p>
<div class="filter-bar">
  <button class="active" onclick="filterCards('all')">All</button>
  <button onclick="filterCards('pending')">Pending</button>
  <button onclick="filterCards('approved')">Approved</button>
  <button onclick="filterCards('denied')">Denied</button>
</div>
<div class="grid">
  {''.join(html_items)}
</div>
<script>
const votes = {{}};
function vote(id, choice) {{
  votes[id] = choice;
  const card = document.querySelector(`[data-id="${{id}}"]`);
  card.dataset.status = choice === 'approve' ? 'approved' : 'denied';
  const res = document.getElementById('result-' + id);
  res.textContent = choice === 'approve' ? 'Approved' : 'Denied';
  res.className = 'vote-result ' + (choice === 'approve' ? 'voted-approve' : 'voted-deny');
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  updateSummary();
}}
function filterCards(filter) {{
  document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.item-card').forEach(card => {{
    const s = card.dataset.status;
    if (filter === 'all') card.classList.remove('hidden');
    else if (filter === 'pending') card.classList.toggle('hidden', s !== 'pending');
    else if (filter === 'approved') card.classList.toggle('hidden', s !== 'approved');
    else if (filter === 'denied') card.classList.toggle('hidden', s !== 'denied');
  }});
}}
function updateSummary() {{
  const total = document.querySelectorAll('.item-card').length;
  const approved = document.querySelectorAll('[data-status="approved"]').length;
  const denied = document.querySelectorAll('[data-status="denied"]').length;
  const pending = total - approved - denied;
  document.querySelector('.summary').textContent =
    `${{total}} items — ${{approved}} approved, ${{denied}} denied, ${{pending}} pending`;
}}
function exportVotes() {{
  const blob = new Blob([JSON.stringify(votes, null, 2)], {{type:'application/json'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'image_votes.json';
  a.click();
}}
</script>
</body>
</html>"""

    os.makedirs(os.path.dirname(WEBPAGE_PATH), exist_ok=True)
    with open(WEBPAGE_PATH, "w") as f:
        f.write(html)
    print(f"Approval webpage written to {WEBPAGE_PATH}")


def main():
    # Load config
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    all_items = config.get("items", {})

    # Filter items
    items_to_gen = {}
    for item_id, item_data in all_items.items():
        category = item_data.get("category", "")
        rarity = item_data.get("rarity", "")
        if category in EXCLUDE_CATEGORIES:
            continue
        if rarity in EXCLUDE_RARITIES:
            continue
        items_to_gen[item_id] = item_data

    print(f"Total items to regenerate: {len(items_to_gen)}")

    # Load state for resumability
    state = load_state()
    completed = set(state.get("completed", []))

    results = {}
    count = 0
    for item_id, item_data in sorted(items_to_gen.items()):
        if item_id in completed:
            print(f"[SKIP] {item_id} (already done)")
            results[item_id] = {"status": "completed"}
            continue

        name = item_data.get("name", item_id)
        category = item_data.get("category", "unknown")
        rarity = item_data.get("rarity", "unknown")
        bg_color = RARITY_COLORS.get(rarity, "#888888")

        prompt = build_prompt(name, category, bg_color)
        print(f"\n[{count+1}/{len(items_to_gen)}] Generating: {item_id} ({name}, {rarity})")
        print(f"  Prompt: {prompt[:120]}...")

        ok, result = generate_image(prompt)
        if ok:
            out_path = os.path.join(OUTPUT_DIR, f"{item_id}_2nd.png")
            with open(out_path, "wb") as f:
                f.write(result)
            print(f"  Saved: {out_path}")
            results[item_id] = {"status": "completed", "path": out_path}
            completed.add(item_id)
        else:
            print(f"  FAILED: {result}")
            results[item_id] = {"status": "failed", "error": result}
            state.setdefault("failed", []).append(item_id)

        state["completed"] = list(completed)
        save_state(state)
        count += 1
        time.sleep(1.5)  # rate limit

    # Build approval webpage
    build_approval_webpage(items_to_gen, results)

    # Summary
    success = sum(1 for r in results.values() if r["status"] == "completed")
    failed = sum(1 for r in results.values() if r["status"] == "failed")
    print(f"\n=== DONE === Success: {success}, Failed: {failed}, Total: {len(items_to_gen)}")
    print(f"Approval page: {WEBPAGE_PATH}")


if __name__ == "__main__":
    main()
