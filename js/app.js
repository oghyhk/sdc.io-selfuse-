// ============================================================
// app.js — DOM UI for menu, inventory, auth, market, and crate loot panel
// ============================================================

import { Game, GAME_STATE } from './game.js';
import {
    ProfileStore,
    AMMO_PACK_LIMIT,
    AMMO_DEFINITION_IDS,
    GUN_LOADOUT_SLOTS,
    LOADOUT_SLOTS,
    ITEM_DEFS,
    RARITY_ORDER,
    STARTER_LOADOUT,
    loadRuntimeDevConfig,
    formatCompactValue,
    getLoadoutSlotCategory,
    getOwnedItemsByCategory,
    getRarityMeta,
    getSlotLabel,
    getItemCategoryLabel,
    summarizeProfile,
    getProfileInventoryValue,
    getStashSummary,
    getItemImagePath,
    getSafeboxSummary,
    getEntriesSpaceUsed,
    getEntrySpaceUsed,
    SAFEBOX_CAPACITY,
    MAX_PLAYER_LEVEL,
    isEquipmentCategory,
    isAmmoDefinition,
    isConsumableDefinition,
    isStackableDefinition,
    getAmmoAmountForEntry,
    getStackableAmountForEntry,
    getAmmoCountForProfile,
    getPlayerLevelProgress,
    getPlayerLevelRequirement,
    getNextClaimablePlayerLevelReward,
    getNextPlayerLevelReward,
    getClaimedPlayerLevelRewardLevels,
    getBuyTradeTotal,
    getSellTradeTotal,
    getMinimumTradeQuantity,
    MIN_TRADE_TOTAL,
    apiFetch,
    runtimeAchievements
} from './profile.js';
import { getRosterLeaderboardEntries } from './ai_roster.js';

const store = new ProfileStore();

const canvas = document.getElementById('gameCanvas');
const loading = document.getElementById('loading');
const topBar = document.getElementById('topBar');
const topbarLevelBox = document.getElementById('topbarLevelBox');
const topbarLeaderboardBox = document.getElementById('topbarLeaderboardBox');
const redeemButton = document.getElementById('redeemButton');
const authButton = document.getElementById('authButton');
const authMenuWrap = document.getElementById('authMenuWrap');
const authDropdown = document.getElementById('authDropdown');
const menuScreen = document.getElementById('menuScreen');
const inventoryScreen = document.getElementById('inventoryScreen');
const marketScreen = document.getElementById('marketScreen');
const placeholderScreen = document.getElementById('placeholderScreen');
const placeholderTitle = document.getElementById('placeholderTitle');
const placeholderSubtitle = document.getElementById('placeholderSubtitle');
const placeholderSummary = document.getElementById('placeholderSummary');
const placeholderContent = document.getElementById('placeholderContent');
const placeholderBackButton = document.getElementById('placeholderBackButton');
const mailButton = document.getElementById('mailButton');
const mailBadge = document.getElementById('mailBadge');
const mailScreen = document.getElementById('mailScreen');
const mailList = document.getElementById('mailList');
const mailSubtitle = document.getElementById('mailSubtitle');
const mailBackButton = document.getElementById('mailBackButton');
const menuSummary = document.getElementById('menuSummary');
const inventoryCoins = document.getElementById('inventoryCoins');
const inventoryStats = document.getElementById('inventoryStats');
const loadoutSections = document.getElementById('loadoutSections');
const openPresetSaveButton = document.getElementById('openPresetSaveButton');
const stashSummary = document.getElementById('stashSummary');
const prepBackpackStats = document.getElementById('prepBackpackStats');
const prepBackpackCollection = document.getElementById('prepBackpackCollection');
const safeboxStats = document.getElementById('safeboxStats');
const safeboxCollection = document.getElementById('safeboxCollection');
const itemCollection = document.getElementById('itemCollection');
const gunCollection = document.getElementById('gunCollection');
const equipmentCollection = document.getElementById('equipmentCollection');
const marketCoins = document.getElementById('marketCoins');
const marketTypeNav = document.getElementById('marketTypeNav');
const marketSections = document.getElementById('marketSections');
const marketMessage = document.getElementById('marketMessage');
const difficultySelect = document.getElementById('difficultySelect');
const startButton = document.getElementById('startButton');
const menuLoadoutButtons = document.getElementById('menuLoadoutButtons');
const menuLoadoutPreview = document.getElementById('menuLoadoutPreview');
const inventoryButton = document.getElementById('inventoryButton');
const marketButton = document.getElementById('marketButton');
const backButton = document.getElementById('backButton');
const marketBackButton = document.getElementById('marketBackButton');
const authModal = document.getElementById('authModal');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');
const authForm = document.getElementById('authForm');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authSubmit = document.getElementById('authSubmit');
const loginModeButton = document.getElementById('loginModeButton');
const signupModeButton = document.getElementById('signupModeButton');
const authModeToggle = loginModeButton.parentElement;
const authClose = document.getElementById('authClose');
const logoutButton = document.getElementById('logoutButton');
const accountActions = document.getElementById('accountActions');
const equipmentDetailModal = document.getElementById('equipmentDetailModal');
const detailType = document.getElementById('detailType');
const detailName = document.getElementById('detailName');
const detailImage = document.getElementById('detailImage');
const detailDescription = document.getElementById('detailDescription');
const detailMeta = document.getElementById('detailMeta');
const detailActions = document.getElementById('detailActions');
const detailMessage = document.getElementById('detailMessage');
const detailClose = document.getElementById('detailClose');
const cratePanel = document.getElementById('cratePanel');
const cratePrompt = document.getElementById('cratePrompt');
const crateItems = document.getElementById('crateItems');
const crateMessage = document.getElementById('crateMessage');
const raidLoadoutPanel = document.getElementById('raidLoadoutPanel');
const raidLoadoutItems = document.getElementById('raidLoadoutItems');
const raidBackpackPanel = document.getElementById('raidBackpackPanel');
const raidBackpackStats = document.getElementById('raidBackpackStats');
const raidBackpackItems = document.getElementById('raidBackpackItems');
const raidSafeboxStats = document.getElementById('raidSafeboxStats');
const raidSafeboxItems = document.getElementById('raidSafeboxItems');
const raidDetailModal = document.getElementById('raidDetailModal');
const raidDetailType = document.getElementById('raidDetailType');
const raidDetailName = document.getElementById('raidDetailName');
const raidDetailImage = document.getElementById('raidDetailImage');
const raidDetailDescription = document.getElementById('raidDetailDescription');
const raidDetailMeta = document.getElementById('raidDetailMeta');
const raidDetailActions = document.getElementById('raidDetailActions');
const raidDetailMessage = document.getElementById('raidDetailMessage');
const raidDetailClose = document.getElementById('raidDetailClose');
const tradeModal = document.getElementById('tradeModal');
const tradeTitle = document.getElementById('tradeTitle');
const tradeSubtitle = document.getElementById('tradeSubtitle');
const tradeForm = document.getElementById('tradeForm');
const tradeQuantity = document.getElementById('tradeQuantity');
const tradeQuantitySlider = document.getElementById('tradeQuantitySlider');
const tradeMinLabel = document.getElementById('tradeMinLabel');
const tradeMaxLabel = document.getElementById('tradeMaxLabel');
const tradeHint = document.getElementById('tradeHint');
const tradeSubmit = document.getElementById('tradeSubmit');
const tradeClose = document.getElementById('tradeClose');
const tradeMessage = document.getElementById('tradeMessage');
const presetSaveModal = document.getElementById('presetSaveModal');
const presetSaveClose = document.getElementById('presetSaveClose');
const presetSaveOptions = document.getElementById('presetSaveOptions');
const chaosStartModal = document.getElementById('chaosStartModal');
const chaosStartClose = document.getElementById('chaosStartClose');
const chaosStartBack = document.getElementById('chaosStartBack');
const chaosStartContinue = document.getElementById('chaosStartContinue');

let currentView = 'menu';
let authMode = 'login';
const DISPLAY_RARITY_ORDER = [...RARITY_ORDER].reverse();
let activeDetailDefinitionId = null;
let activeDetailSource = 'stash';
let activeDetailEntryIndex = null;
let activeRaidDetail = null;
let activeTradeRequest = null;
let selectedMenuLoadoutSlot = 0;
let pendingChaosStartResolver = null;
let authDropdownOpen = false;
let currentPlaceholderPage = 'raid-history';
let runtimeConfigRefreshPromise = null;
let lastRuntimeConfigRefreshAt = 0;

const MARKET_CATEGORY_ORDER = ['goods', 'ammo', 'consumable', 'gun', 'armor', 'helmet', 'shoes', 'backpack'];
const TOPBAR_PAGE_OPTIONS = [
    { id: 'raid-history', label: 'Raid History' },
    { id: 'stats', label: 'Profile' },
    { id: 'player-level', label: 'Player Level' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'safebox', label: 'Safebox' },
    { id: 'operation-pass', label: 'Operation Pass' },
];
const DIFFICULTY_BUTTON_THEME = {
    easy: 'easy',
    advanced: 'advanced',
    hell: 'hell',
    chaos: 'chaos',
};
const COIN_ICON_PATH = '/assets/items/coin.png';

const game = new Game(canvas, {
    onStateChange: handleGameState,
    onRunComplete: async (result) => {
        await store.applyRaidOutcome(result);
        syncAiRosterToServer();
        _leaderboardCache = null; // invalidate so next view fetches fresh
        renderAll();
        refreshLeaderboardRank();
    }
});

function formatDate(iso) {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getLegendFrameClass(rarity) {
    return rarity === 'legend' ? ' legend-frame' : '';
}

function getLegendTextClass(rarity) {
    return rarity === 'legend' ? ' legend-text' : '';
}

function getCoinIconMarkup() {
    return `<img class="coin-inline-icon" src="${COIN_ICON_PATH}" alt="coin">`;
}

function formatCoinAmountMarkup(value) {
    return `<span class="coin-inline">${formatCompactValue(value)}${getCoinIconMarkup()}</span>`;
}

function formatLabeledCoinMarkup(label, value) {
    return `${label} ${formatCoinAmountMarkup(value)}`;
}

function formatPlayerLevelRewardMarkup(reward) {
    if (!reward) return '—';
    if (reward.type === 'item' && reward.itemId) {
        const definition = ITEM_DEFS[reward.itemId];
        const rewardName = definition?.name || reward.itemName || reward.itemId;
        return `<span>${rewardName} ×${Math.max(1, Number(reward.quantity) || 1)}</span>`;
    }
    return formatCoinAmountMarkup(reward.coins || 0);
}

function formatPlayerLevelRewardToast(reward) {
    if (!reward) return 'Reward received.';
    if (reward.type === 'item' && reward.itemId) {
        const definition = ITEM_DEFS[reward.itemId];
        const rewardName = definition?.name || reward.itemName || reward.itemId;
        return `Received Lv. ${reward.level} reward: ${rewardName} x${Math.max(1, Number(reward.quantity) || 1)}.`;
    }
    return `Received Lv. ${reward.level} reward: ${formatCompactValue(reward.coins)} coins.`;
}

function getOperatorsKilledCount(entry) {
    if (!entry || typeof entry !== 'object') return 0;
    if (entry.operatorKills != null) return Math.max(0, Number(entry.operatorKills) || 0);
    const totalKills = Math.max(0, Number(entry.kills) || 0);
    const aiEnemyKills = Math.max(0, Number(entry.aiEnemyKills) || 0);
    return Math.max(0, totalKills - aiEnemyKills);
}

function getDifficultyTheme(difficulty) {
    return DIFFICULTY_BUTTON_THEME[difficulty] || 'easy';
}

function formatDifficultyLabel(difficulty) {
    const theme = getDifficultyTheme(difficulty);
    const label = theme.charAt(0).toUpperCase() + theme.slice(1);
    return `<span class="difficulty-text difficulty-${theme}">${label}</span>`;
}

function getRaidHistorySummary(profile) {
    const history = Array.isArray(profile?.raidHistory) ? profile.raidHistory : [];
    const raids = history.length;
    const extractions = history.filter((entry) => entry.extractedSuccess).length;
    const operatorKills = history.reduce((sum, entry) => sum + getOperatorsKilledCount(entry), 0);
    const aiEnemyKills = history.reduce((sum, entry) => sum + (Number(entry.aiEnemyKills) || 0), 0);
    const netValue = history.reduce((sum, entry) => sum + (Number(entry.netValue) || 0), 0);
    return {
        raids,
        extractions,
        operatorKills,
        aiEnemyKills,
        netValue,
    };
}

function formatPercent(value) {
    const numeric = Number(value) || 0;
    return `${numeric.toFixed(1)}%`;
}

function formatKdValue(kills, deaths) {
    const safeKills = Number(kills) || 0;
    const safeDeaths = Number(deaths) || 0;
    if (safeDeaths <= 0) {
        return safeKills > 0 ? String(safeKills) : '0.00';
    }
    return (safeKills / safeDeaths).toFixed(2);
}

function getDifficultyStats(profile) {
    const history = Array.isArray(profile?.raidHistory) ? profile.raidHistory : [];
    return Object.keys(DIFFICULTY_BUTTON_THEME).map((difficulty) => {
        const runs = history.filter((entry) => (entry.difficulty || 'advanced') === difficulty);
        const raidsPlayed = runs.length;
        const extractions = runs.filter((entry) => entry.extractedSuccess).length;
        const deaths = runs.filter((entry) => !entry.extractedSuccess).length;
        const operatorKills = runs.reduce((sum, entry) => sum + getOperatorsKilledCount(entry), 0);
        const successRate = raidsPlayed > 0 ? (extractions / raidsPlayed) * 100 : 0;
        return {
            difficulty,
            raidsPlayed,
            extractions,
            deaths,
            operatorKills,
            successRate,
            kd: formatKdValue(operatorKills, deaths),
        };
    });
}

function getKdDisplayTier(kdValue, difficulty = 'advanced') {
    const kd = Math.max(0, Number(kdValue) || 0);
    if (difficulty === 'chaos') {
        if (kd < 0.3) return 'white';
        if (kd < 0.8) return 'green';
        if (kd < 1) return 'blue';
        if (kd < 1.5) return 'purple';
        if (kd < 3) return 'gold';
        if (kd < 12) return 'red';
        return 'legend';
    }

    if (difficulty === 'hell') {
        if (kd < 0.5) return 'white';
        if (kd < 0.9) return 'green';
        if (kd < 1.3) return 'blue';
        if (kd < 2) return 'purple';
        if (kd < 9) return 'gold';
        if (kd < 50) return 'red';
        return 'legend';
    }

    if (kd < 0.75) return 'white';
    if (kd < 1) return 'green';
    if (kd < 1.5) return 'blue';
    if (kd < 3) return 'purple';
    if (kd < 12) return 'gold';
    if (kd < 100) return 'red';
    return 'legend';
}

function getKdMetricClass(difficulty, kdValue) {
    if (!['advanced', 'hell', 'chaos'].includes(difficulty)) return '';
    return ` kd-tier-${getKdDisplayTier(kdValue, difficulty)}`;
}

function renderProfilePage(profile) {
    const overall = getRaidHistorySummary(profile);
    const difficultyStats = getDifficultyStats(profile);
    const overallDeaths = (Array.isArray(profile?.raidHistory) ? profile.raidHistory : []).filter((entry) => !entry.extractedSuccess).length;
    const overallKd = formatKdValue(overall.operatorKills, overallDeaths);

    placeholderTitle.textContent = 'Profile';
    placeholderSubtitle.textContent = 'Your operator profile, combat stats, and account settings.';
    placeholderSummary.innerHTML = '';

    const avatarDataUrl = profile.avatarDataUrl || '';
    const pfpHtml = avatarDataUrl
        ? `<img src="${avatarDataUrl}" alt="Avatar">`
        : `<div class="account-pfp-placeholder">?</div>`;

    placeholderContent.innerHTML = `
        <div class="account-layout">
            <div class="account-sidebar">
                <div class="account-pfp-wrap" id="accountPfpWrap" title="Change avatar">
                    ${pfpHtml}
                    <div class="account-pfp-overlay">CHANGE</div>
                </div>
                <input type="file" id="accountPfpInput" accept="image/*" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none">
                <div class="account-username-display">${escapeHtml(profile.username)}</div>
                <div class="account-elo-display">ELO ${profile.elo || 1000}</div>
            </div>
            <div class="account-main">
                <div class="account-section">
                    <h3>Combat Stats</h3>
                    <div class="summary-tiles-inline">
                        <div class="summary-tile"><span class="summary-label">Total Raids</span><strong>${overall.raids}</strong></div>
                        <div class="summary-tile"><span class="summary-label">Success Rate</span><strong>${formatPercent(overall.raids > 0 ? (overall.extractions / overall.raids) * 100 : 0)}</strong></div>
                        <div class="summary-tile"><span class="summary-label">Operator KD</span><strong>${overallKd}</strong></div>
                        <div class="summary-tile"><span class="summary-label">Player Level</span><strong>${getPlayerLevelProgress(profile.playerExp || 0).level}</strong></div>
                    </div>
                    <div class="stats-grid" style="margin-top: 14px;">
                        ${difficultyStats.map((entry) => `
                            <article class="stats-card">
                                <div class="stats-card-header">
                                    ${formatDifficultyLabel(entry.difficulty)}
                                </div>
                                <div class="stats-card-metrics">
                                    <div class="stats-card-metric">
                                        <span>Raids Played</span>
                                        <strong>${entry.raidsPlayed}</strong>
                                    </div>
                                    <div class="stats-card-metric">
                                        <span>Success Rate</span>
                                        <strong>${formatPercent(entry.successRate)}</strong>
                                    </div>
                                    <div class="stats-card-metric">
                                        <span>Operators Killed</span>
                                        <strong>${entry.operatorKills}</strong>
                                    </div>
                                    <div class="stats-card-metric${getKdMetricClass(entry.difficulty, entry.kd)}">
                                        <span>Operator KD</span>
                                        <strong>${entry.kd}</strong>
                                    </div>
                                </div>
                            </article>
                        `).join('')}
                    </div>
                </div>
                <div class="account-section">
                    <h3 class="account-section-toggle" data-toggle="security" style="cursor:pointer;user-select:none">Security <span class="toggle-arrow" id="securityArrow">▸</span></h3>
                    <div id="securityContent" style="display:none">
                    <div class="account-field">
                        <label>Current Password</label>
                        <input type="password" id="accountCurrentPw" placeholder="Enter current password">
                    </div>
                    <div class="account-field">
                        <label>New Password</label>
                        <input type="password" id="accountNewPw" placeholder="Enter new password">
                    </div>
                    <div class="account-field">
                        <label>Confirm Password</label>
                        <input type="password" id="accountConfirmPw" placeholder="Confirm new password">
                    </div>
                    <button class="account-btn" id="accountChangePwBtn">Change Password</button>
                    <div id="accountPwMsg" class="account-msg"></div>
                    </div>
                </div>
                <div class="account-section">
                    <h3>Achievements</h3>
                    <div class="achievements-grid">
                        ${renderAchievementBadges()}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Hide the generic "coming soon" actions
    const actionsEl = placeholderContent.parentElement?.querySelector('.placeholder-actions');
    if (actionsEl) actionsEl.style.display = 'none';

    // PFP upload
    const pfpWrap = document.getElementById('accountPfpWrap');
    const pfpInput = document.getElementById('accountPfpInput');
    pfpWrap?.addEventListener('click', () => pfpInput?.click());
    pfpInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await compressImageTo512(file);
            profile.avatarDataUrl = dataUrl;
            await store.saveCurrentProfile();
            renderProfilePage(store.getCurrentProfile());
        } catch (err) {
            console.error('PFP upload failed:', err);
        }
    });

    // Security section toggle
    document.querySelector('[data-toggle="security"]')?.addEventListener('click', () => {
        const content = document.getElementById('securityContent');
        const arrow = document.getElementById('securityArrow');
        if (content) {
            const hidden = content.style.display === 'none';
            content.style.display = hidden ? '' : 'none';
            if (arrow) arrow.textContent = hidden ? '▾' : '▸';
        }
    });

    // Password change
    document.getElementById('accountChangePwBtn')?.addEventListener('click', async () => {
        const msgEl = document.getElementById('accountPwMsg');
        const currentPw = document.getElementById('accountCurrentPw')?.value || '';
        const newPw = document.getElementById('accountNewPw')?.value || '';
        const confirmPw = document.getElementById('accountConfirmPw')?.value || '';
        if (!currentPw) { msgEl.className = 'account-msg error'; msgEl.textContent = 'Enter current password.'; return; }
        if (newPw.length < 3) { msgEl.className = 'account-msg error'; msgEl.textContent = 'New password must be at least 3 characters.'; return; }
        if (newPw !== confirmPw) { msgEl.className = 'account-msg error'; msgEl.textContent = 'Passwords do not match.'; return; }
        try {
            const res = await apiFetch('/change-password', {
                method: 'POST',
                body: JSON.stringify({ username: profile.username, currentPassword: currentPw, newPassword: newPw })
            });
            if (res.ok) {
                msgEl.className = 'account-msg success'; msgEl.textContent = 'Password changed!';
                store.currentProfile.password = newPw;
                document.getElementById('accountCurrentPw').value = '';
                document.getElementById('accountNewPw').value = '';
                document.getElementById('accountConfirmPw').value = '';
            } else {
                msgEl.className = 'account-msg error'; msgEl.textContent = res.message || 'Failed to change password.';
            }
        } catch (err) {
            msgEl.className = 'account-msg error'; msgEl.textContent = 'Network error.';
        }
    });
}

function renderPlayerLevelPage(profile) {
    const progress = getPlayerLevelProgress(profile?.playerExp || 0);
    const currentRequirement = getPlayerLevelRequirement(progress.level);
    const nextRequirement = getPlayerLevelRequirement(progress.level + 1);
    const nextClaimableReward = getNextClaimablePlayerLevelReward(profile);
    const nextReward = nextClaimableReward || getNextPlayerLevelReward(profile);
    const claimedRewardCount = getClaimedPlayerLevelRewardLevels(profile).length;
    const pendingRewardCount = summarizeProfile(profile).pendingPlayerLevelRewards || 0;
    const rewardButtonLabel = nextClaimableReward ? 'Receive Reward' : (nextReward ? `Unlocks at Lv. ${nextReward.level}` : 'All Rewards Claimed');
    const rewardSummaryLabel = nextClaimableReward
        ? `Lowest available reward: Lv. ${nextClaimableReward.level}`
        : nextReward
            ? `Next reward arrives at Lv. ${nextReward.level}`
            : 'All milestone rewards have been claimed.';
    const rewardDescription = nextClaimableReward
        ? nextClaimableReward.description
        : nextReward
            ? `${nextReward.description} Reach the required level to unlock it.`
            : 'No more player level rewards remain.';
    const rewardValue = formatPlayerLevelRewardMarkup(nextReward);

    placeholderTitle.textContent = 'Player Level';
    placeholderSubtitle.textContent = 'Earn EXP by killing players, AI operators, and enemies. EXP follows the game compact value format.';
    placeholderSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Current Level</span><strong>Lv. ${progress.level}</strong></div>
        <div class="summary-tile"><span class="summary-label">Total EXP</span><strong>${formatCompactValue(progress.totalExp)}</strong></div>
        <div class="summary-tile"><span class="summary-label">Pending Rewards</span><strong>${pendingRewardCount}</strong></div>
        <div class="summary-wide player-level-shell">
            <div class="player-level-grid">
                <article class="player-level-card player-level-hero">
                    <div class="player-level-badge">Lv. ${progress.level}</div>
                    <div class="player-level-progress-copy">
                        <div class="summary-label">Progress</div>
                        <strong>${progress.isMaxLevel ? 'MAX LEVEL REACHED' : `${formatCompactValue(progress.currentLevelExp)} / ${formatCompactValue(progress.nextLevelExp)} EXP`}</strong>
                        <span>${progress.isMaxLevel ? 'No further EXP can be earned beyond the level cap.' : `${formatCompactValue(progress.expToNext)} EXP to Lv. ${progress.level + 1}`}</span>
                    </div>
                    <div class="player-level-progress-bar">
                        <div class="player-level-progress-fill" style="width:${(progress.progressRatio * 100).toFixed(2)}%"></div>
                    </div>
                </article>
                <article class="player-level-card">
                    <div class="summary-label">Current Upgrade Cost</div>
                    <strong>${progress.level >= MAX_PLAYER_LEVEL ? 'MAX' : formatCompactValue(currentRequirement)}</strong>
                    <span>${progress.level >= MAX_PLAYER_LEVEL ? 'Already capped.' : `Required EXP to go from Lv. ${progress.level} to Lv. ${progress.level + 1}`}</span>
                </article>
                <article class="player-level-card">
                    <div class="summary-label">Next Upgrade Cost</div>
                    <strong>${progress.level >= MAX_PLAYER_LEVEL - 1 ? 'MAX' : formatCompactValue(nextRequirement)}</strong>
                    <span>${progress.level >= MAX_PLAYER_LEVEL - 1 ? 'No later upgrade cost exists.' : `Projected EXP requirement after the next level-up.`}</span>
                </article>
                <article class="player-level-card player-level-reward-card">
                    <div class="summary-label">Level Reward Claim</div>
                    <strong>${rewardSummaryLabel}</strong>
                    <div class="player-level-reward-value">${rewardValue}</div>
                    <span>${rewardDescription}</span>
                    <div class="player-level-reward-meta">
                        <span>Claimed: ${claimedRewardCount}</span>
                        <span>${nextReward ? `Reward milestone: Lv. ${nextReward.level}` : `Level cap: Lv. ${MAX_PLAYER_LEVEL}`}</span>
                    </div>
                    <button
                        id="claimPlayerLevelRewardButton"
                        class="primary-button player-level-claim-button"
                        ${nextClaimableReward ? '' : 'disabled'}
                    >${rewardButtonLabel}</button>
                </article>
                <article class="player-level-card player-level-rules">
                    <div class="summary-label">Level Rule</div>
                    <strong>Lv. 0 → 1 requires 10 EXP</strong>
                    <span>Each next level requires 3% more EXP than the previous one, with a minimum increase of 1. Milestone rewards can grant coins or one item type with quantity, and are claimed one at a time from the lowest unlocked level.</span>
                </article>
            </div>
        </div>
    `;
}

function renderRaidHistoryPage(profile) {
    const history = Array.isArray(profile?.raidHistory) ? profile.raidHistory.slice(0, 100) : [];
    const historySummary = getRaidHistorySummary(profile);

    placeholderTitle.textContent = 'Raid History';
    placeholderSubtitle.textContent = 'Recent 100 raids with extraction outcome and net gain. AI operator kills count as operator kills.';
    placeholderSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Raids Stored</span><strong>${historySummary.raids}/100</strong></div>
        <div class="summary-tile"><span class="summary-label">Successful Extractions</span><strong>${historySummary.extractions}</strong></div>
        <div class="summary-tile"><span class="summary-label">Total Net Value</span><strong>${formatCoinAmountMarkup(historySummary.netValue)}</strong></div>
        <div class="summary-tile"><span class="summary-label">Operators Killed</span><strong>${historySummary.operatorKills}</strong></div>
        <div class="summary-tile"><span class="summary-label">AI Enemies Killed</span><strong>${historySummary.aiEnemyKills}</strong></div>
        <div class="summary-wide raid-history-shell">
            ${history.length
                ? `<div class="raid-history-list">${history.map((entry) => {
                    const successClass = entry.extractedSuccess ? 'success' : 'failure';
                    const successLabel = entry.extractedSuccess ? 'Extracted' : 'Failed';
                    const netClass = (Number(entry.netValue) || 0) >= 0 ? 'positive' : 'negative';
                    return `
                        <article class="raid-history-card">
                            <div class="raid-history-header">
                                <div>
                                    <div class="raid-history-date">${formatDate(entry.createdAt)}</div>
                                    <div class="raid-history-meta">${entry.durationLabel || '00:00'} · ${formatDifficultyLabel(entry.difficulty || 'advanced')}</div>
                                </div>
                                <span class="raid-history-status ${successClass}">${successLabel}</span>
                            </div>
                            <div class="raid-history-metrics">
                                <div class="raid-history-metric"><span>Operators Killed</span><strong>${getOperatorsKilledCount(entry)}</strong></div>
                                <div class="raid-history-metric"><span>AI Enemies Killed</span><strong>${Number(entry.aiEnemyKills) || 0}</strong></div>
                                <div class="raid-history-metric"><span>Value Extracted</span><strong>${formatCoinAmountMarkup(entry.valueExtracted || 0)}</strong></div>
                                <div class="raid-history-metric ${netClass}"><span>Net Value</span><strong>${formatCoinAmountMarkup(entry.netValue || 0)}</strong></div>
                            </div>
                        </article>
                    `;
                }).join('')}</div>`
                : '<div class="empty-state">No raids recorded yet.</div>'}
        </div>
    `;
}

let _leaderboardRenderVersion = 0;
let _leaderboardCache = null;
let _leaderboardCacheAge = 0;
const LEADERBOARD_CACHE_TTL = 8000; // 8 seconds

async function renderLeaderboardPage(profile) {
    const elo = profile?.elo ?? 1000;
    const renderVersion = ++_leaderboardRenderVersion;

    placeholderTitle.textContent = 'Leaderboard';
    placeholderSubtitle.textContent = 'Top 100 operators ranked by ELO. Ratings update after every raid.';

    // Use cached data if fresh enough to avoid flash
    const now = Date.now();
    if (_leaderboardCache && (now - _leaderboardCacheAge) < LEADERBOARD_CACHE_TTL) {
        _renderLeaderboardTable(profile, elo, _leaderboardCache);
        return;
    }

    // Show loading only on first render (no cache)
    if (!_leaderboardCache) {
        placeholderSummary.innerHTML = `
            <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
            <div class="summary-tile"><span class="summary-label">Your ELO</span><strong>${elo}</strong></div>
            <div class="summary-tile"><span class="summary-label">Loading…</span><strong>—</strong></div>
        `;
    } else {
        // Show stale cache while refreshing
        _renderLeaderboardTable(profile, elo, _leaderboardCache);
    }

    let data;
    try {
        data = await store.fetchLeaderboard();
    } catch {
        if (!_leaderboardCache) {
            placeholderSummary.innerHTML += '<div class="summary-wide"><div class="empty-state">Failed to load leaderboard.</div></div>';
        }
        return;
    }

    // If another render started while we were fetching, bail out
    if (renderVersion !== _leaderboardRenderVersion) return;
    // If we navigated away from leaderboard, bail out
    if (currentPlaceholderPage !== 'leaderboard' || currentView !== 'placeholder') return;

    _leaderboardCache = data;
    _leaderboardCacheAge = Date.now();

    _renderLeaderboardTable(profile, elo, data);
}

function _renderLeaderboardTable(profile, elo, data) {
    const leaderboard = data?.leaderboard || [];
    const playerEntry = data?.player || null;
    const total = data?.total || 0;

    const yourRank = playerEntry ? `#${playerEntry.rank}` : 'Unranked';
    cachedLeaderboardPlayer = playerEntry;
    renderTopbarLeaderboardBox();

    // Preserve scroll positions before rewriting DOM
    const shellEl = placeholderSummary.querySelector('.leaderboard-shell');
    const prevShellScroll = shellEl ? shellEl.scrollTop : 0;
    const prevScreenScroll = placeholderScreen.scrollTop;

    placeholderSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Your ELO</span><strong>${elo}</strong></div>
        <div class="summary-tile"><span class="summary-label">Your Rank</span><strong>${yourRank}</strong></div>
        <div class="summary-tile"><span class="summary-label">Total Players</span><strong>${total}</strong></div>
        <div class="summary-wide leaderboard-shell">
            ${leaderboard.length ? `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th class="lb-col-rank">#</th>
                        <th class="lb-col-name">Operator</th>
                        <th class="lb-col-elo">ELO</th>
                        <th class="lb-col-stat">Raids</th>
                        <th class="lb-col-stat">Extractions</th>
                        <th class="lb-col-stat">Kills</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboard.map((entry) => {
                        const isYou = playerEntry && entry.rank === playerEntry.rank && entry.username === playerEntry.username;
                        const rankBadge = entry.rank <= 3 ? ` lb-rank-${entry.rank}` : '';
                        const aiTag = entry.isBoss ? ' <span class="lb-ai-tag lb-boss-tag">BOSS</span>' : entry.isAI ? ' <span class="lb-ai-tag">AI</span>' : '';
                        return `
                        <tr class="lb-row${isYou ? ' lb-row-you' : ''}${rankBadge}${entry.isAI ? ' lb-row-ai' : ''}">
                            <td class="lb-col-rank">${entry.rank}</td>
                            <td class="lb-col-name">${entry.username}${aiTag}${isYou ? ' <span class="lb-you-tag">(You)</span>' : ''}</td>
                            <td class="lb-col-elo">${entry.elo}</td>
                            <td class="lb-col-stat">${entry.totalRuns}</td>
                            <td class="lb-col-stat">${entry.totalExtractions}</td>
                            <td class="lb-col-stat">${entry.totalKills}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>` : '<div class="empty-state">No players ranked yet.</div>'}
            ${playerEntry && playerEntry.rank > 100 ? `
            <div class="lb-your-row-footer">
                <table class="leaderboard-table lb-footer-table">
                    <tbody>
                        <tr class="lb-row lb-row-you">
                            <td class="lb-col-rank">${playerEntry.rank}</td>
                            <td class="lb-col-name">${playerEntry.username} <span class="lb-you-tag">(You)</span></td>
                            <td class="lb-col-elo">${playerEntry.elo}</td>
                            <td class="lb-col-stat">${playerEntry.totalRuns}</td>
                            <td class="lb-col-stat">${playerEntry.totalExtractions}</td>
                            <td class="lb-col-stat">${playerEntry.totalKills}</td>
                        </tr>
                    </tbody>
                </table>
            </div>` : ''}
        </div>
    `;

    // Restore scroll positions after DOM rewrite
    const newShellEl = placeholderSummary.querySelector('.leaderboard-shell');
    if (newShellEl) newShellEl.scrollTop = prevShellScroll;
    placeholderScreen.scrollTop = prevScreenScroll;
}

function renderGenericPlaceholderPage(profile, page) {
    const summary = summarizeProfile(profile);
    placeholderTitle.textContent = page.label;
    placeholderSubtitle.textContent = `${page.label} will be implemented later.`;
    placeholderSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Coins</span><strong>${formatCoinAmountMarkup(summary.coins)}</strong></div>
        <div class="summary-tile"><span class="summary-label">Inventory Value</span><strong>${formatCoinAmountMarkup(getProfileInventoryValue(profile))}</strong></div>
        <div class="summary-tile"><span class="summary-label">Status</span><strong>Coming Soon</strong></div>
    `;
}

function getCurrentPlaceholderPage() {
    return TOPBAR_PAGE_OPTIONS.find((entry) => entry.id === currentPlaceholderPage) || TOPBAR_PAGE_OPTIONS[0];
}

function closeAuthDropdown() {
    authDropdownOpen = false;
    authDropdown.classList.add('hidden');
}

function openAuthDropdown() {
    if (!store.isAuthenticated()) return;
    authDropdownOpen = true;
    authDropdown.classList.remove('hidden');
}

function toggleAuthDropdown() {
    if (!store.isAuthenticated()) return;
    if (authDropdownOpen) closeAuthDropdown();
    else openAuthDropdown();
}

function openPlaceholderPage(pageId) {
    currentPlaceholderPage = TOPBAR_PAGE_OPTIONS.some((entry) => entry.id === pageId) ? pageId : TOPBAR_PAGE_OPTIONS[0].id;
    closeAuthDropdown();
    setView('placeholder');
}

function setCoinAmountElement(element, value) {
    element.innerHTML = formatCoinAmountMarkup(value);
}

function getLoadoutSlotVisualClass(slot) {
    return slot.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function getEquippedCount(profile, definitionId) {
    return Object.values(profile.loadout || {}).filter((entry) => entry === definitionId).length;
}

function getEquippedLoadoutSlot(profile, definitionId) {
    return LOADOUT_SLOTS.find((slot) => profile.loadout?.[slot] === definitionId) || null;
}

function updateStartButtonDifficultyTheme() {
    const difficulty = DIFFICULTY_BUTTON_THEME[difficultySelect.value] || 'easy';
    startButton.dataset.difficulty = difficulty;
}

function getProfileCurrentLoadoutSnapshot(profile) {
    return {
        name: 'Current Loadout',
        loadout: { ...(profile.loadout || {}) },
        backpackItems: [...(profile.backpackItems || [])],
        safeboxItems: [...(profile.safeboxItems || [])],
        updatedAt: null,
    };
}

function hasAtLeastOneGunInSnapshot(snapshot) {
    return GUN_LOADOUT_SLOTS.some((slot) => ITEM_DEFS[snapshot?.loadout?.[slot]]?.category === 'gun');
}

function ensureSelectedMenuLoadout(profile) {
    if (selectedMenuLoadoutSlot >= 0 && !profile.savedLoadouts?.[selectedMenuLoadoutSlot]) {
        selectedMenuLoadoutSlot = profile.savedLoadouts?.[0] ? 0 : -1;
    }
}

function getSelectedMenuLoadoutSnapshot(profile) {
    ensureSelectedMenuLoadout(profile);
    if (selectedMenuLoadoutSlot < 0) {
        return getProfileCurrentLoadoutSnapshot(profile);
    }
    return profile.savedLoadouts?.[selectedMenuLoadoutSlot] || null;
}

function getLoadoutSnapshotValue(snapshot) {
    return LOADOUT_SLOTS.reduce((sum, slot) => {
        const definitionId = snapshot?.loadout?.[slot];
        return sum + (ITEM_DEFS[definitionId]?.sellValue || 0);
    }, 0);
}

function getLoadoutSnapshotStackableValue(snapshot) {
    const stackEntries = [
        ...(snapshot?.backpackItems || []),
        ...(snapshot?.safeboxItems || []),
    ];
    return stackEntries.reduce((sum, entry) => {
        const definition = ITEM_DEFS[entry?.definitionId];
        if (!definition) return sum;
        if (isAmmoDefinition(definition.id)) {
            return sum + ((definition.sellValue || 0) * getAmmoAmountForEntry(entry));
        }
        if (isConsumableDefinition(definition.id)) {
            return sum + ((definition.sellValue || 0) * getStackableAmountForEntry(entry));
        }
        return sum;
    }, 0);
}

function summarizeLoadoutSnapshot(snapshot) {
    if (!snapshot) {
        return {
            title: 'Empty Slot',
            equipment: 'No saved loadout yet.',
            loadoutValue: 0,
            stackableValue: 0,
            backpackSpaceUsed: 0,
            backpackAmount: 0,
            safeboxSpaceUsed: 0,
            updatedAt: null,
        };
    }

    return {
        title: snapshot.name || 'Saved Loadout',
        equipment: LOADOUT_SLOTS.map((slot) => `${getSlotLabel(slot)}: ${ITEM_DEFS[snapshot.loadout?.[slot]]?.name || 'Empty'}`).join(' · '),
        loadoutValue: getLoadoutSnapshotValue(snapshot),
        stackableValue: getLoadoutSnapshotStackableValue(snapshot),
        backpackSpaceUsed: getEntriesSpaceUsed(snapshot.backpackItems || []),
        backpackAmount: (snapshot.backpackItems || []).reduce((sum, entry) => sum + (isStackableDefinition(entry.definitionId) ? getStackableAmountForEntry(entry) : 1), 0),
        safeboxSpaceUsed: getEntriesSpaceUsed(snapshot.safeboxItems || []),
        updatedAt: snapshot.updatedAt || null,
    };
}

function renderMenuLoadoutSelection(profile) {
    const saved = profile.savedLoadouts || [];
    menuLoadoutButtons.innerHTML = [
        { label: 'Current', slot: -1, empty: false },
        ...saved.map((snapshot, index) => ({ label: `${index + 1}`, slot: index, empty: !snapshot }))
    ].map((entry) => `
        <button class="menu-loadout-button ${selectedMenuLoadoutSlot === entry.slot ? 'active' : ''}" data-loadout-slot="${entry.slot}" ${entry.empty ? 'disabled' : ''}>
            ${entry.label}${entry.empty ? ' · Empty' : ''}
        </button>
    `).join('');

    const summary = summarizeLoadoutSnapshot(getSelectedMenuLoadoutSnapshot(profile));
    menuLoadoutPreview.innerHTML = `
        <div class="inventory-header" style="margin-bottom:0;">
            <div>
                <div class="section-subtitle">Selected Preset</div>
                <h3>${summary.title}</h3>
            </div>
            <div class="section-subtitle">${summary.updatedAt ? `Saved ${formatDate(summary.updatedAt)}` : 'Using currently equipped layout'}</div>
        </div>
        <div class="menu-loadout-preview-grid">
            <div class="summary-tile summary-wide" style="grid-column: span 3; min-height:auto;">
                <span class="summary-label">Equipment</span>
                <strong>${summary.equipment}</strong>
            </div>
            <div class="summary-tile summary-wide" style="grid-column: span 3; min-height:auto;">
                <span class="summary-label">Est. Value of Loadout</span>
                <strong>${formatCoinAmountMarkup(summary.loadoutValue)}</strong>
                <div class="section-subtitle" style="margin-top:8px;">Est. Value of Consumables and Ammo in Loadout: ${formatCoinAmountMarkup(summary.stackableValue)}</div>
            </div>
        </div>
    `;
}

function renderPresetSaveOptions(profile) {
    const saved = profile.savedLoadouts || [];
    presetSaveOptions.innerHTML = saved.map((snapshot, index) => {
        const summary = summarizeLoadoutSnapshot(snapshot);
        return `
            <button class="preset-save-option ${snapshot ? '' : 'empty'}" data-save-loadout-slot="${index}">
                <div class="inventory-header" style="margin-bottom:0; align-items:flex-start;">
                    <div>
                        <div class="section-subtitle">Preset ${index + 1}</div>
                        <strong>${summary.title}</strong>
                    </div>
                    <div class="section-subtitle">${summary.updatedAt ? formatDate(summary.updatedAt) : 'Empty'}</div>
                </div>
                <div class="section-subtitle">${snapshot ? summary.equipment : 'No preset saved in this slot yet.'}</div>
                <div class="section-subtitle">Backpack ${summary.backpackSpaceUsed} space · ${summary.backpackAmount} total units · Safebox ${summary.safeboxSpaceUsed} space</div>
            </button>
        `;
    }).join('');
}

function openPresetSaveModal() {
    const profile = store.getCurrentProfile();
    renderPresetSaveOptions(profile);
    presetSaveModal.classList.remove('hidden');
}

function closePresetSaveModal() {
    presetSaveModal.classList.add('hidden');
}

function openChaosStartModal() {
    chaosStartModal.classList.remove('hidden');
}

function closeChaosStartModal() {
    chaosStartModal.classList.add('hidden');
}

function resolveChaosStart(shouldContinue) {
    const resolver = pendingChaosStartResolver;
    pendingChaosStartResolver = null;
    closeChaosStartModal();
    if (resolver) resolver(Boolean(shouldContinue));
}

function confirmChaosStart() {
    if (pendingChaosStartResolver) {
        pendingChaosStartResolver(false);
    }
    openChaosStartModal();
    return new Promise((resolve) => {
        pendingChaosStartResolver = resolve;
    });
}

async function refreshRuntimeDevConfigAndRender() {
    if (runtimeConfigRefreshPromise) return runtimeConfigRefreshPromise;
    runtimeConfigRefreshPromise = (async () => {
        await loadRuntimeDevConfig();
        lastRuntimeConfigRefreshAt = Date.now();
        renderAll();
    })().finally(() => {
        runtimeConfigRefreshPromise = null;
    });
    return runtimeConfigRefreshPromise;
}

function scheduleRuntimeConfigRefresh(force = false) {
    const now = Date.now();
    if (!force && now - lastRuntimeConfigRefreshAt < 1500) return;
    refreshRuntimeDevConfigAndRender();
}

function setView(view) {
    currentView = view;
    if (view !== 'placeholder') {
        closeAuthDropdown();
    }
    renderVisibility();
    if (view === 'inventory') renderInventory();
    else if (view === 'market') renderMarket();
    else if (view === 'placeholder') renderPlaceholderScreen();
    else if (view === 'mail') renderMailScreen();
    else renderMenu();

    if (view === 'menu' || view === 'inventory' || view === 'market' || view === 'placeholder' || view === 'mail') {
        scheduleRuntimeConfigRefresh();
    }
}

function renderVisibility() {
    const showOverlay = game.state === GAME_STATE.MENU;
    topBar.classList.toggle('hidden', !showOverlay);
    menuScreen.classList.toggle('hidden', !showOverlay || currentView !== 'menu');
    inventoryScreen.classList.toggle('hidden', !showOverlay || currentView !== 'inventory');
    marketScreen.classList.toggle('hidden', !showOverlay || currentView !== 'market');
    placeholderScreen.classList.toggle('hidden', !showOverlay || currentView !== 'placeholder');
    mailScreen.classList.toggle('hidden', !showOverlay || currentView !== 'mail');
    document.body.classList.toggle('playing', game.state === GAME_STATE.PLAYING);
}

function renderAuthButton() {
    const profile = store.getCurrentProfile();
    if (!store.isAuthenticated()) {
        authButton.classList.remove('auth-status-button');
        authButton.textContent = 'Login / Sign Up';
        authDropdown.innerHTML = '';
        closeAuthDropdown();
        return;
    }

    const inventoryValue = getProfileInventoryValue(profile);
    authButton.classList.add('auth-status-button');
    authButton.innerHTML = `
        <span class="auth-status-name">${profile.username} · ${formatCoinAmountMarkup(profile.coins)}</span>
        <span class="auth-status-value">${formatLabeledCoinMarkup('Inv Value', inventoryValue)}</span>
    `;
    authDropdown.innerHTML = TOPBAR_PAGE_OPTIONS.map((entry) => `
        <button class="auth-dropdown-button ${currentView === 'placeholder' && currentPlaceholderPage === entry.id ? 'active' : ''}" data-topbar-page="${entry.id}">${entry.label}</button>
    `).join('');
    authDropdown.classList.toggle('hidden', !authDropdownOpen);
}

function renderTopbarLevelBox() {
    const profile = store.getCurrentProfile();
    const progress = getPlayerLevelProgress(profile?.playerExp || 0);
    const progressWidth = (progress.progressRatio * 100).toFixed(2);
    const expLabel = progress.isMaxLevel
        ? `${formatCompactValue(progress.totalExp)} EXP banked`
        : `${formatCompactValue(progress.currentLevelExp)} / ${formatCompactValue(progress.nextLevelExp)} EXP`;
    const nextLabel = progress.isMaxLevel
        ? 'MAX LEVEL'
        : `${formatCompactValue(progress.expToNext)} to Lv. ${progress.level + 1}`;

    topbarLevelBox.innerHTML = `
        <div class="topbar-level-header">
            <span class="topbar-level-title">Player Level</span>
            <strong class="topbar-level-value">Lv. ${progress.level}</strong>
        </div>
        <div class="topbar-level-meta">
            <span>${expLabel}</span>
            <span>${nextLabel}</span>
        </div>
        <div class="topbar-level-bar">
            <div class="topbar-level-fill" style="width:${progressWidth}%"></div>
        </div>
    `;
}

let cachedLeaderboardPlayer = null;
let leaderboardBoxFetchTimer = null;
let _lastLbBoxElo = null;
let _lastLbBoxRank = null;

function renderTopbarLeaderboardBox() {
    const profile = store.getCurrentProfile();
    const elo = profile?.elo ?? 1000;
    const rankText = cachedLeaderboardPlayer && cachedLeaderboardPlayer.rank <= 1000
        ? `Rank #${cachedLeaderboardPlayer.rank}`
        : 'Unranked';

    // Skip DOM write if nothing changed
    if (_lastLbBoxElo === elo && _lastLbBoxRank === rankText) return;
    _lastLbBoxElo = elo;
    _lastLbBoxRank = rankText;

    topbarLeaderboardBox.innerHTML = `
        <div class="topbar-lb-header">
            <span class="topbar-lb-title">Leaderboard</span>
            <strong class="topbar-lb-elo">${elo} ELO</strong>
        </div>
        <div class="topbar-lb-meta">
            <span class="topbar-lb-rank">${rankText}</span>
            <span>Click to view</span>
        </div>
    `;
}

function refreshLeaderboardRank() {
    if (!store.isAuthenticated()) {
        cachedLeaderboardPlayer = null;
        renderTopbarLeaderboardBox();
        return;
    }
    store.fetchLeaderboard().then((data) => {
        cachedLeaderboardPlayer = data?.player || null;
        renderTopbarLeaderboardBox();
    }).catch(() => {});
}

function syncAiRosterToServer() {
    const entries = getRosterLeaderboardEntries();
    if (!entries.length) return;
    store.pushAiRoster(entries).catch(() => {});
}

function renderAchievementBadges() {
    const achievements = runtimeAchievements || {};
    const entries = Object.entries(achievements).filter(([, a]) => a.enabled !== false);
    if (!entries.length) return '<div style="color:rgba(255,255,255,0.4);font-size:13px">No achievements available.</div>';
    return entries.map(([id, ach]) => {
        const imgSrc = ach.image || '';
        return `
            <div class="achievement-badge" title="${escapeHtml(ach.name || id)}">
                ${imgSrc
                    ? `<img src="${imgSrc}" alt="${escapeHtml(ach.name || '')}">`
                    : `<div class="achievement-badge-placeholder">?</div>`
                }
                <div class="achievement-tooltip">
                    ${imgSrc ? `<img src="${imgSrc}" alt="">` : ''}
                    <div class="achievement-tooltip-name">${escapeHtml(ach.name || id)}</div>
                    <div class="achievement-tooltip-desc">${escapeHtml(ach.description || 'No description.')}</div>
                </div>
            </div>
        `;
    }).join('');
}



function compressImageTo512(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                // Center-crop to square
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function renderPlaceholderScreen() {
    const profile = store.getCurrentProfile();
    const page = getCurrentPlaceholderPage();
    if (page.id === 'player-level') {
        renderPlayerLevelPage(profile);
        return;
    }
    if (page.id === 'raid-history') {
        renderRaidHistoryPage(profile);
        return;
    }
    if (page.id === 'stats') {
        renderProfilePage(profile);
        return;
    }
    if (page.id === 'leaderboard') {
        renderLeaderboardPage(profile);
        return;
    }
    // Restore generic actions visibility for non-profile pages
    const actionsEl = placeholderContent?.parentElement?.querySelector('.placeholder-actions');
    if (actionsEl) actionsEl.style.display = '';
    if (placeholderContent) placeholderContent.innerHTML = '';
    renderGenericPlaceholderPage(profile, page);
}

function renderMenu() {
    const profile = store.getCurrentProfile();
    ensureSelectedMenuLoadout(profile);
    const summary = summarizeProfile(profile);

    menuSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Coins</span><strong>${formatCoinAmountMarkup(summary.coins)}</strong></div>
        <div class="summary-tile"><span class="summary-label">Extractions</span><strong>${summary.extractedRuns}</strong></div>
        <div class="summary-tile"><span class="summary-label">Last Haul</span><strong>${summary.lastExtractItemCount} items</strong></div>
    `;

    renderMenuLoadoutSelection(profile);
}

function renderLoadoutSections(profile) {
    const slotOrder = ['helmet', 'armor', 'backpack', 'gunPrimary', 'gunSecondary', 'shoes'];
    loadoutSections.innerHTML = `
        <div class="loadout-visual">
            <div class="operator-layout">
                <div class="operator-silhouette">
                    <div class="operator-head"></div>
                    <div class="operator-body"></div>
                    <div class="operator-leg left"></div>
                    <div class="operator-leg right"></div>
                </div>
                ${slotOrder.map((slot) => {
                    const definition = ITEM_DEFS[profile.loadout[slot]];
                    const rarity = getRarityMeta(definition?.rarity || 'white');
                    const isEmpty = !definition;
                    return `
                        <button class="loadout-slot-card slot-${getLoadoutSlotVisualClass(slot)}" ${isEmpty ? 'disabled' : `data-slot="${slot}" data-item-id="${definition.id}"`} title="${definition?.name || `Empty ${getSlotLabel(slot)}`}">
                            <div class="loadout-slot-type${getLegendTextClass(definition?.rarity)}" style="color:${rarity.color}">${getSlotLabel(slot)}</div>
                            ${isEmpty
                                ? `<div class="loadout-slot-icon" style="display:flex;align-items:center;justify-content:center;border-color:rgba(255,255,255,0.14);color:rgba(255,255,255,0.4)">—</div>`
                                : `<img class="loadout-slot-icon${getLegendFrameClass(definition?.rarity)}" src="${getItemImagePath(definition.id)}" alt="${definition.name}" style="border-color:${rarity.color}">`}
                            <div class="loadout-slot-name${getLegendTextClass(definition?.rarity)}" style="color:${isEmpty ? 'rgba(255,255,255,0.55)' : rarity.color}">${definition?.name || 'Empty'}</div>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function getOwnedCounts(profile) {
    const ownedCounts = {};
    for (const item of profile.stashItems || []) {
        ownedCounts[item.definitionId] = (ownedCounts[item.definitionId] || 0) + 1;
    }
    for (const definitionId of AMMO_DEFINITION_IDS) {
        const amount = getAmmoCountForProfile(profile, definitionId);
        if (amount > 0) {
            ownedCounts[definitionId] = amount;
        }
    }
    return ownedCounts;
}

function getAmmoPackLabel(definition, quantity) {
    return `${definition.name} x${quantity}`;
}

function getAmmoPackDescription(definition, quantity) {
    return `${definition.name} pack containing ${quantity} round${quantity === 1 ? '' : 's'}.`;
}

function getStackableEntryLabel(definition, quantity) {
    return `${definition.name} x${quantity}`;
}

function getStackableEntryDescription(definition, quantity) {
    if (isAmmoDefinition(definition.id)) {
        return getAmmoPackDescription(definition, quantity);
    }
    return `${definition.name} stack containing ${quantity} use${quantity === 1 ? '' : 's'}.`;
}

function getDetailSourceEntry(profile) {
    if (activeDetailEntryIndex == null) return null;
    if (activeDetailSource === 'safebox') {
        return (profile.safeboxItems || [])[activeDetailEntryIndex] || null;
    }
    if (activeDetailSource === 'prep-backpack') {
        return (profile.backpackItems || [])[activeDetailEntryIndex] || null;
    }
    return null;
}

function getReplacementItemId(profile, slot, excludedDefinitionId) {
    const ownedItems = getOwnedItemsByCategory(profile, getLoadoutSlotCategory(slot));
    const alternative = ownedItems.find(({ definition }) => definition.id !== excludedDefinitionId);
    return alternative?.definition?.id || null;
}

function getUnequipTargetId(profile, slot, definitionId) {
    if (GUN_LOADOUT_SLOTS.includes(slot) || ['armor', 'helmet', 'shoes', 'backpack'].includes(slot)) return '__empty__';
    const replacementId = getReplacementItemId(profile, slot, definitionId);
    if (replacementId) return replacementId;
    const starterId = STARTER_LOADOUT[slot];
    return starterId && starterId !== definitionId ? starterId : null;
}

function openEquipmentDetail(definitionId, source = 'stash', entryIndex = null) {
    activeDetailDefinitionId = definitionId;
    activeDetailSource = source;
    activeDetailEntryIndex = entryIndex;
    renderEquipmentDetail();
    equipmentDetailModal.classList.remove('hidden');
}

function closeEquipmentDetail() {
    equipmentDetailModal.classList.add('hidden');
    detailMessage.textContent = '';
    activeDetailDefinitionId = null;
    activeDetailSource = 'stash';
    activeDetailEntryIndex = null;
}

function openTradeModal(config) {
    activeTradeRequest = config;
    const minQuantity = Math.max(1, Math.min(config.maxQuantity, config.minQuantity || 1));
    const initialQuantity = Math.max(minQuantity, Math.min(config.maxQuantity, config.initialQuantity || minQuantity));
    tradeTitle.textContent = config.title;
    tradeSubtitle.textContent = config.subtitle;
    tradeQuantity.min = String(minQuantity);
    tradeQuantity.max = String(config.maxQuantity);
    tradeQuantity.value = String(initialQuantity);
    tradeQuantitySlider.min = String(minQuantity);
    tradeQuantitySlider.max = String(config.maxQuantity);
    tradeQuantitySlider.value = String(initialQuantity);
    tradeMinLabel.textContent = `Min ${minQuantity}`;
    tradeMaxLabel.textContent = `Max ${config.maxQuantity}`;
    tradeHint.innerHTML = config.hint;
    tradeSubmit.textContent = config.confirmLabel;
    tradeMessage.textContent = '';
    tradeModal.classList.remove('hidden');
    tradeQuantity.focus();
    tradeQuantity.select();
}

function closeTradeModal() {
    tradeModal.classList.add('hidden');
    tradeMessage.textContent = '';
    activeTradeRequest = null;
}

function openRaidDetail(source, identifier) {
    activeRaidDetail = { source, identifier };
    renderRaidDetail();
    raidDetailModal.classList.remove('hidden');
}

function closeRaidDetail() {
    raidDetailModal.classList.add('hidden');
    raidDetailMessage.textContent = '';
    activeRaidDetail = null;
}

function renderRaidDetail(message = '') {
    const raidState = game.getRaidUiView();
    if (!activeRaidDetail || !raidState.visible) {
        closeRaidDetail();
        return;
    }

    let item = null;
    if (activeRaidDetail.source === 'backpack') {
        item = raidState.backpack.items.find((entry) => entry.id === activeRaidDetail.identifier) || null;
    } else if (activeRaidDetail.source === 'safebox') {
        item = raidState.safebox.items.find((entry) => entry.id === activeRaidDetail.identifier) || null;
    } else if (activeRaidDetail.source === 'loadout') {
        item = raidState.loadout.items.find((entry) => entry.slot === activeRaidDetail.identifier) || null;
    }
    if (!item) {
        closeRaidDetail();
        return;
    }

    raidDetailType.textContent = activeRaidDetail.source === 'loadout'
        ? `Equipped ${item.slotLabel}`
        : activeRaidDetail.source === 'safebox'
            ? `Safebox ${item.slotLabel}`
            : item.slotLabel;
    raidDetailType.style.color = item.rarityColor;
    raidDetailType.classList.toggle('legend-text', item.rarity === 'legend');
    raidDetailName.textContent = item.name;
    raidDetailName.style.color = item.rarityColor;
    raidDetailName.classList.toggle('legend-text', item.rarity === 'legend');
    raidDetailImage.src = getItemImagePath(item.definitionId);
    raidDetailImage.classList.toggle('legend-frame', item.rarity === 'legend');
    raidDetailDescription.textContent = item.description;
    raidDetailMeta.innerHTML = `
        <span class="${item.rarity === 'legend' ? 'legend-text' : ''}" style="color:${item.rarityColor}">${item.rarityLabel}</span>
        <span>${formatLabeledCoinMarkup('Value', item.sellValue)}</span>
        ${activeRaidDetail.source === 'backpack' ? '<span>Backpack item</span>' : activeRaidDetail.source === 'safebox' ? '<span>Safebox item</span>' : '<span>Equipped item</span>'}
    `;

    const actions = [];
    if (activeRaidDetail.source === 'backpack') {
        if (isEquipmentCategory(item.category)) {
            actions.push('<button class="primary-button" data-raid-action="equip">Equip</button>');
        }
        if (!isConsumableDefinition(item.definitionId)) {
            actions.push('<button class="secondary-button" data-raid-action="to-safebox">Move to Safebox</button>');
        }
        actions.push('<button class="secondary-button" data-raid-action="abandon">Abandon</button>');
    } else if (activeRaidDetail.source === 'safebox') {
        actions.push('<button class="secondary-button" data-raid-action="to-backpack">Move to Backpack</button>');
    } else {
        actions.push('<button class="secondary-button" data-raid-action="unequip">Unequip</button>');
        actions.push('<button class="secondary-button" data-raid-action="abandon">Abandon</button>');
    }

    raidDetailActions.innerHTML = actions.join('');
    raidDetailMessage.textContent = message;
}

function renderEquipmentDetail(message = '') {
    const profile = store.getCurrentProfile();
    const definition = ITEM_DEFS[activeDetailDefinitionId];
    if (!definition) return;

    const rarity = getRarityMeta(definition.rarity);
    const ownedCounts = getOwnedCounts(profile);
    const sourceEntry = getDetailSourceEntry(profile);
    const sourceStackQuantity = sourceEntry && isStackableDefinition(sourceEntry.definitionId)
        ? getStackableAmountForEntry(sourceEntry)
        : 0;
    const owned = isAmmoDefinition(definition.id)
        ? (activeDetailSource === 'stash' ? getAmmoCountForProfile(profile, definition.id) : sourceStackQuantity)
        : (ownedCounts[definition.id] || 0);
    const isEquipment = isEquipmentCategory(definition.category);
    const equippedCount = isEquipment ? getEquippedCount(profile, definition.id) : 0;
    const equipped = equippedCount > 0;
    const equippedSlot = isEquipment ? getEquippedLoadoutSlot(profile, definition.id) : null;
    const unequipTargetId = isEquipment && equippedSlot ? getUnequipTargetId(profile, equippedSlot, definition.id) : null;

    detailType.textContent = getItemCategoryLabel(definition);
    detailType.style.color = rarity.color;
    detailType.classList.toggle('legend-text', definition.rarity === 'legend');
    detailName.textContent = sourceStackQuantity ? getStackableEntryLabel(definition, sourceStackQuantity) : definition.name;
    detailName.style.color = rarity.color;
    detailName.classList.toggle('legend-text', definition.rarity === 'legend');
    detailImage.src = getItemImagePath(definition.id);
    detailImage.classList.toggle('legend-frame', definition.rarity === 'legend');
    detailDescription.textContent = sourceStackQuantity ? getStackableEntryDescription(definition, sourceStackQuantity) : definition.description;
    detailMeta.innerHTML = `
        <span class="${definition.rarity === 'legend' ? 'legend-text' : ''}" style="color:${rarity.color}">${rarity.label}</span>
        <span>${sourceStackQuantity ? `Pack ${sourceStackQuantity}` : `Owned ${owned}`}</span>
        <span>${formatLabeledCoinMarkup('Value', sourceEntry?.sellValue || definition.sellValue)}</span>
        <span>${formatLabeledCoinMarkup('Sell', getSellTradeTotal(definition.id, 1))}</span>
        <span>${formatLabeledCoinMarkup('Buy', getBuyTradeTotal(definition.id, 1))}</span>
        ${equipped ? `<span>Equipped${equippedCount > 1 ? ` x${equippedCount}` : ''}</span>` : ''}
        ${activeDetailSource === 'safebox' ? '<span>Stored in safebox</span>' : ''}
        ${activeDetailSource === 'prep-backpack' ? '<span>Packed for raid</span>' : ''}
    `;

    const prepBackpackCapacity = getInventoryBackpackCapacity(profile);
    const actions = [];
    if (activeDetailSource === 'safebox') {
        actions.push('<button class="primary-button" data-detail-action="stash">Move to Inventory</button>');
    } else if (activeDetailSource === 'prep-backpack') {
        actions.push('<button class="primary-button" data-detail-action="backpack-to-stash">Move to Inventory</button>');
    } else if (isEquipment && owned > equippedCount) {
        actions.push('<button class="primary-button" data-detail-action="equip">Equip</button>');
    }
    if (activeDetailSource === 'stash' && getMovableToPrepBackpackCount(profile, definition.id) > 0 && getEntriesSpaceUsed(profile.backpackItems || []) + getEntrySpaceUsed({ definitionId: definition.id }) <= prepBackpackCapacity) {
        actions.push('<button class="secondary-button" data-detail-action="prep-backpack">Put in Backpack</button>');
    }
    if (activeDetailSource === 'stash' && getMovableToSafeboxCount(profile, definition.id) > 0 && getEntriesSpaceUsed(profile.safeboxItems || []) + getEntrySpaceUsed({ definitionId: definition.id }) <= SAFEBOX_CAPACITY) {
        actions.push('<button class="secondary-button" data-detail-action="safebox">Put in Safebox</button>');
    }
    if (activeDetailSource !== 'safebox' && activeDetailSource !== 'prep-backpack' && owned > 0 && definition.id !== 'ammo_white') {
        actions.push('<button class="secondary-button" data-detail-action="sell">Sell</button>');
    }
    if (activeDetailSource === 'stash' && isEquipment && equipped) {
        actions.push(`<button class="secondary-button" data-detail-action="unequip" ${unequipTargetId ? '' : 'disabled'}>Unequip</button>`);
    }
    detailActions.innerHTML = actions.join('') || '<div class="empty-state">Nothing available here.</div>';
    detailMessage.textContent = message || (activeDetailSource !== 'safebox' && equipped && !unequipTargetId ? 'No replacement item available for unequip.' : '');
}

function getSellableCount(profile, definitionId) {
    if (isAmmoDefinition(definitionId)) {
        return getAmmoCountForProfile(profile, definitionId);
    }
    const ownedCounts = getOwnedCounts(profile);
    const owned = ownedCounts[definitionId] || 0;
    return Math.max(0, owned - getEquippedCount(profile, definitionId));
}

function getMovableToSafeboxCount(profile, definitionId) {
    if (isConsumableDefinition(definitionId)) {
        return 0;
    }
    if (isAmmoDefinition(definitionId)) {
        return getAmmoCountForProfile(profile, definitionId);
    }
    const ownedCounts = getOwnedCounts(profile);
    const owned = ownedCounts[definitionId] || 0;
    return Math.max(0, owned - getEquippedCount(profile, definitionId));
}

function getInventoryBackpackCapacity(profile) {
    return LOADOUT_SLOTS.reduce((capacity, slot) => {
        const definition = ITEM_DEFS[profile.loadout[slot]];
        return capacity + (definition?.modifiers?.carrySlots || 0);
    }, 10);
}

function getMovableToPrepBackpackCount(profile, definitionId) {
    if (isAmmoDefinition(definitionId)) return getAmmoCountForProfile(profile, definitionId);
    const ownedCounts = getOwnedCounts(profile);
    const owned = ownedCounts[definitionId] || 0;
    return Math.max(0, owned - getEquippedCount(profile, definitionId));
}

function getMaxAffordableQuantity(profile, definitionId) {
    let low = 0;
    let high = 100000;
    while (low < high) {
        const mid = Math.floor((low + high + 1) / 2);
        if (getBuyTradeTotal(definitionId, mid) <= profile.coins) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

function renderStash(profile) {
    const stash = getStashSummary(profile);
    const rarityTiles = RARITY_ORDER.map((rarity) => {
        const meta = getRarityMeta(rarity);
        return `<div class="summary-tile"><span class="summary-label ${rarity === 'legend' ? 'legend-text' : ''}">${meta.label}</span><strong class="${rarity === 'legend' ? 'legend-text' : ''}" style="color:${meta.color}">${stash[rarity]}</strong></div>`;
    }).join('');

    stashSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Coins</span><strong>${formatCoinAmountMarkup(profile.coins)}</strong></div>
        <div class="summary-tile"><span class="summary-label">Stored Items</span><strong>${stash.items}</strong></div>
        ${rarityTiles}
    `;

    setCoinAmountElement(inventoryCoins, profile.coins);
    inventoryStats.textContent = `Runs ${profile.stats.totalExtractions} · Kills ${profile.stats.totalKills}`;
    const prepBackpackCapacity = getInventoryBackpackCapacity(profile);
    prepBackpackStats.textContent = `${getEntriesSpaceUsed(profile.backpackItems || [])}/${prepBackpackCapacity} carrying space used`;
    const safebox = getSafeboxSummary(profile);
    safeboxStats.textContent = `${safebox.used}/${safebox.capacity} carrying space used`;

    const ownedCounts = getOwnedCounts(profile);

    const equipmentCategories = new Set(LOADOUT_SLOTS);
    const sortedDefinitions = Object.values(ITEM_DEFS).sort((a, b) => {
        const rarityOrder = DISPLAY_RARITY_ORDER.indexOf(a.rarity) - DISPLAY_RARITY_ORDER.indexOf(b.rarity);
        if (rarityOrder !== 0) return rarityOrder;
        const categoryOrder = getItemCategoryLabel(a).localeCompare(getItemCategoryLabel(b));
        if (categoryOrder !== 0) return categoryOrder;
        return a.name.localeCompare(b.name);
    });

    const renderCollection = (definitions) => {
        if (!definitions.length) {
            return '<div class="empty-state">No entries in this category yet.</div>';
        }

        return definitions.map((definition) => {
            const owned = ownedCounts[definition.id] || 0;
            const rarity = getRarityMeta(definition.rarity);
            const isEquipment = equipmentCategories.has(definition.category);
            const isEquipped = isEquipment && profile.loadout[definition.category] === definition.id;
            return `
                <div class="collection-icon-card ${owned ? '' : 'unowned'} ${isEquipment ? 'equipable' : ''} ${isEquipped ? 'equipped' : ''}" title="${definition.name}" data-item-id="${definition.id}" ${isEquipment ? `data-slot="${definition.category}"` : ''}>
                    <img class="collection-icon${getLegendFrameClass(definition.rarity)}" src="${getItemImagePath(definition.id)}" alt="${definition.name}" loading="lazy">
                    <div class="collection-count" style="color:${owned ? rarity.color : 'transparent'}">${owned ? `x${owned}` : ''}</div>
                </div>
            `;
        }).join('');
    };

    safeboxCollection.innerHTML = (profile.safeboxItems || []).length
        ? profile.safeboxItems.map((entry, index) => {
            const definition = ITEM_DEFS[entry.definitionId];
            const rarity = getRarityMeta(definition.rarity);
            const stackQuantity = isStackableDefinition(entry.definitionId) ? getStackableAmountForEntry(entry) : 0;
            return `
                <div class="collection-icon-card equipable" data-safebox-definition-id="${definition.id}" data-safebox-index="${index}" title="${definition.name}">
                    <img class="collection-icon${getLegendFrameClass(definition.rarity)}" src="${getItemImagePath(definition.id)}" alt="${definition.name}" loading="lazy">
                    <div class="collection-count" style="color:${rarity.color}">${stackQuantity ? `x${stackQuantity}` : definition.name}</div>
                </div>
            `;
        }).join('')
        : '<div class="empty-state">Safebox is empty.</div>';

    prepBackpackCollection.innerHTML = (profile.backpackItems || []).length
        ? profile.backpackItems.map((entry, index) => {
            const definition = ITEM_DEFS[entry.definitionId];
            const rarity = getRarityMeta(definition.rarity);
            const stackQuantity = isStackableDefinition(entry.definitionId) ? getStackableAmountForEntry(entry) : 0;
            return `
                <div class="collection-icon-card equipable" data-prep-backpack-definition-id="${definition.id}" data-prep-backpack-index="${index}" title="${definition.name}">
                    <img class="collection-icon${getLegendFrameClass(definition.rarity)}" src="${getItemImagePath(definition.id)}" alt="${definition.name}" loading="lazy">
                    <div class="collection-count" style="color:${rarity.color}">${stackQuantity ? `x${stackQuantity}` : definition.name}</div>
                </div>
            `;
        }).join('')
        : '<div class="empty-state">Backpack is empty.</div>';

    itemCollection.innerHTML = renderCollection(sortedDefinitions.filter((definition) => !equipmentCategories.has(definition.category) && definition.category !== 'gun' && definition.id !== 'ammo_white'));
    gunCollection.innerHTML = renderCollection(sortedDefinitions.filter((definition) => definition.category === 'gun'));
    equipmentCollection.innerHTML = renderCollection(sortedDefinitions.filter((definition) => equipmentCategories.has(definition.category)));
}

function renderInventory() {
    const profile = store.getCurrentProfile();
    renderLoadoutSections(profile);
    renderPresetSaveOptions(profile);
    renderStash(profile);
    if (!equipmentDetailModal.classList.contains('hidden') && activeDetailDefinitionId) {
        renderEquipmentDetail();
    }
}

function renderMarket() {
    const profile = store.getCurrentProfile();
    const ownedCounts = getOwnedCounts(profile);
    setCoinAmountElement(marketCoins, profile.coins);
    const groupedItems = MARKET_CATEGORY_ORDER.map((category) => ({
        category,
        items: Object.values(ITEM_DEFS)
            .filter((item) => {
                // Exclude unbuyable items (bitcoin is drop-only)
                if (item.id === 'btc') return false;
                if (category === 'goods') return item.lootType === 'goods';
                if (category === 'ammo') return item.lootType === 'ammo' && item.id !== 'ammo_white';
                return item.category === category;
            })
            .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name))
    })).filter((group) => group.items.length);

    marketTypeNav.innerHTML = groupedItems.map((group) => `
        <button class="market-type-button" data-market-nav="${group.category}">${getSlotLabel(group.category)}</button>
    `).join('');

    marketSections.innerHTML = groupedItems.map((group) => `
        <section id="market-section-${group.category}" class="market-section">
            <h3>${getSlotLabel(group.category)}</h3>
            <div class="market-grid">
                ${group.items.map((item) => {
                    const rarity = getRarityMeta(item.rarity);
                    const owned = ownedCounts[item.id] || 0;
                    const marketLocked = item.id === 'ammo_white';
                    return `
                        <div class="market-card" style="border-left:4px solid ${rarity.color}">
                            <img class="item-card-img${getLegendFrameClass(item.rarity)}" src="${getItemImagePath(item.id)}" alt="${item.name}" loading="lazy">
                            <div class="item-card-header">
                                <strong>${item.name}</strong>
                                <span class="${item.rarity === 'legend' ? 'legend-text' : ''}" style="color:${rarity.color}">${rarity.label}</span>
                            </div>
                            <p>${item.description}</p>
                            <div class="item-stats">
                                <span>${getItemCategoryLabel(item)}</span>
                                <span>${formatLabeledCoinMarkup('Value', item.sellValue)}</span>
                                <span>${formatLabeledCoinMarkup('Buy', getBuyTradeTotal(item.id, 1))}</span>
                                <span>${formatLabeledCoinMarkup('Sell', getSellTradeTotal(item.id, 1))}</span>
                                <span>Owned ${owned}</span>
                            </div>
                            <div class="market-actions">
                                <button class="secondary-button" data-market-action="sell" data-item-id="${item.id}" ${(!marketLocked && owned && getSellableCount(profile, item.id) >= getMinimumTradeQuantity(item.id, 'sell')) ? '' : 'disabled'}>${marketLocked ? 'Locked' : 'Sell'}</button>
                                <button class="primary-button" data-market-action="buy" data-item-id="${item.id}" ${(!marketLocked && getMaxAffordableQuantity(profile, item.id) >= getMinimumTradeQuantity(item.id, 'buy')) ? '' : 'disabled'}>${marketLocked ? 'Locked' : 'Buy'}</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </section>
    `).join('');
}

function renderAuthModal() {
    const profile = store.getCurrentProfile();

    if (store.isAuthenticated()) {
        authModeToggle.classList.add('hidden');
        authTitle.textContent = `Signed in as ${profile.username}`;
        authMessage.textContent = 'User data is stored in a local JSON file through the prototype API server.';
        authForm.classList.add('hidden');
        accountActions.classList.remove('hidden');
        return;
    }

    authModeToggle.classList.remove('hidden');
    loginModeButton.classList.toggle('active', authMode === 'login');
    signupModeButton.classList.toggle('active', authMode === 'signup');
    authTitle.textContent = authMode === 'signup' ? 'Create Account' : 'Login';
    authMessage.textContent = authMode === 'signup'
        ? 'Create an account with a username and password. Usernames may contain only English letters and the red heart emoji.'
        : 'Login with your existing username and password. Matching is not case-sensitive, but the registered casing is preserved.';
    authSubmit.textContent = authMode === 'signup' ? 'Create Account' : 'Continue';
    authForm.classList.remove('hidden');
    accountActions.classList.add('hidden');
}

function openAuthModal(mode = 'login') {
    authMode = mode;
    authUsername.value = '';
    authPassword.value = '';
    authModal.classList.remove('hidden');
    renderAuthModal();
}

function closeAuthModal() {
    authModal.classList.add('hidden');
}

function setMarketMessage(message, isError = false) {
    marketMessage.textContent = message;
    marketMessage.dataset.error = isError ? 'true' : 'false';
}

function renderRuntimeUi() {
    const raidState = game.getRaidUiView();
    cratePanel.classList.toggle('hidden', !raidState.crateVisible);
    raidLoadoutPanel.classList.toggle('hidden', !raidState.visible);
    raidBackpackPanel.classList.toggle('hidden', !raidState.visible);

    if (!raidState.crateVisible) {
        cratePrompt.textContent = '';
        crateItems.innerHTML = '';
        crateMessage.textContent = '';
    } else {
        cratePrompt.textContent = `Crate open · ${raidState.crate.itemCount} item(s) · click an item to take it`;
        crateMessage.textContent = raidState.message || '';

        crateItems.innerHTML = raidState.crate.items.length
            ? raidState.crate.items.map((item) => `
                <button class="crate-item-card" data-crate-item-id="${item.id}" style="border-left:4px solid ${item.rarityColor}">
                    <img class="item-card-img${getLegendFrameClass(item.rarity)}" src="${getItemImagePath(item.definitionId)}" alt="${item.name}" loading="lazy">
                    <div class="item-card-header">
                        <strong>${item.name}</strong>
                        <span class="${item.rarity === 'legend' ? 'legend-text' : ''}" style="color:${item.rarityColor}">${item.rarityLabel}</span>
                    </div>
                    <p>${item.description}</p>
                    <div class="item-stats">
                        <span>${getItemCategoryLabel(item)}</span>
                        <span>${formatLabeledCoinMarkup('Value', item.sellValue)}</span>
                        <span>Click to take</span>
                    </div>
                </button>
            `).join('')
            : '<div class="empty-state">Crate already cleared.</div>';
    }

    if (!raidState.visible) {
        raidLoadoutItems.innerHTML = '';
        raidBackpackItems.innerHTML = '';
        raidBackpackStats.textContent = '';
        raidSafeboxStats.textContent = 'Safebox';
        raidSafeboxItems.innerHTML = '';
        if (!raidDetailModal.classList.contains('hidden')) closeRaidDetail();
        return;
    }

    raidLoadoutItems.innerHTML = raidState.loadout.items.map((item) => `
        <button class="raid-icon-button" ${item.definitionId ? `data-raid-source="loadout" data-slot="${item.slot}"` : 'disabled'} style="border-left:4px solid ${item.rarityColor}">
            ${item.definitionId ? `<img class="${item.rarity === 'legend' ? 'legend-frame' : ''}" src="${getItemImagePath(item.definitionId)}" alt="${item.name}" loading="lazy">` : '<div class="collection-icon" style="margin:0 auto;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4)">—</div>'}
            <div class="raid-icon-label">${item.slotLabel}</div>
            <div class="raid-icon-name${item.rarity === 'legend' ? ' legend-text' : ''}" style="color:${item.rarityColor}">${item.name}</div>
        </button>
    `).join('');

    raidBackpackStats.textContent = `${raidState.backpack.spaceUsed}/${raidState.backpack.capacity} carrying space used`;
    raidBackpackItems.innerHTML = raidState.backpack.items.length
        ? raidState.backpack.items.map((item) => `
            <button class="raid-icon-button" data-raid-source="backpack" data-item-id="${item.id}" style="border-left:4px solid ${item.rarityColor}">
                <img class="${item.rarity === 'legend' ? 'legend-frame' : ''}" src="${getItemImagePath(item.definitionId)}" alt="${item.name}" loading="lazy">
                <div class="raid-icon-label">${item.slotLabel}</div>
                <div class="raid-icon-name${item.rarity === 'legend' ? ' legend-text' : ''}" style="color:${item.rarityColor}">${item.name}</div>
            </button>
        `).join('')
        : '<div class="empty-state" style="grid-column:1/-1;">Backpack is empty.</div>';

    raidSafeboxStats.textContent = `Safebox ${raidState.safebox.spaceUsed}/${raidState.safebox.capacity} carrying space used`;
    raidSafeboxItems.innerHTML = raidState.safebox.items.length
        ? raidState.safebox.items.map((item) => `
            <button class="raid-icon-button" data-raid-source="safebox" data-item-id="${item.id}" style="border-left:4px solid ${item.rarityColor}">
                <img class="${item.rarity === 'legend' ? 'legend-frame' : ''}" src="${getItemImagePath(item.definitionId)}" alt="${item.name}" loading="lazy">
                <div class="raid-icon-label">${item.slotLabel}</div>
                <div class="raid-icon-name${item.rarity === 'legend' ? ' legend-text' : ''}" style="color:${item.rarityColor}">${item.name}</div>
            </button>
        `).join('')
        : '<div class="empty-state" style="grid-column:1/-1;">Safebox is empty.</div>';

    if (!raidDetailModal.classList.contains('hidden') && activeRaidDetail) {
        renderRaidDetail();
    }
}

function renderAll() {
    renderAuthButton();
    renderTopbarLevelBox();
    renderTopbarLeaderboardBox();
    renderMenu();
    renderInventory();
    renderMarket();
    renderPlaceholderScreen();
    renderVisibility();
    fetchMail();
    if (!authModal.classList.contains('hidden')) {
        renderAuthModal();
    }
}

function handleGameState(state) {
    if (state === GAME_STATE.MENU) {
        currentView = 'menu';
        closeAuthDropdown();
    }
    renderAll();
}

function parseWholeNumberInput(value) {
    const text = String(value || '').trim();
    if (!/^\d+$/.test(text)) return null;
    return Math.floor(Number(text));
}

function buildMissingLoadoutMessage(preview) {
    const lines = (preview.missingEntries || []).map((entry) => {
        const definition = ITEM_DEFS[entry.definitionId];
        return `• ${definition?.name || entry.definitionId} x${entry.quantity} (${formatCompactValue(entry.totalCost)} coins)`;
    });
    return [
        `Missing items for this loadout will cost ${formatCompactValue(preview.totalCost)} coins.`,
        '',
        ...lines,
        '',
        'Confirm purchase and start the raid?'
    ].join('\n');
}

async function startRaidWithSelectedLoadout() {
    const selectedSlot = selectedMenuLoadoutSlot < 0 ? null : selectedMenuLoadoutSlot;
    const preview = store.getRaidLoadoutPreparationPreview(selectedSlot);
    if (!preview.snapshot) {
        window.alert('Selected loadout slot is empty.');
        return;
    }
    if (!hasAtLeastOneGunInSnapshot(preview.snapshot)) {
        window.alert('Equip at least one gun in your loadout before starting a raid.');
        return;
    }

    const profile = store.getCurrentProfile();
    if (preview.totalCost > 0) {
        if (profile.coins < preview.totalCost) {
            window.alert(`This loadout is missing items worth ${formatCompactValue(preview.totalCost)} coins, but you only have ${formatCompactValue(profile.coins)} coins.`);
            return;
        }
        if (!window.confirm(buildMissingLoadoutMessage(preview))) {
            return;
        }
    }

    if (difficultySelect.value === 'chaos') {
        const shouldContinue = await confirmChaosStart();
        if (!shouldContinue) return;
    }

    await store.applyRaidLoadoutSelection(selectedSlot, { autoBuyMissing: preview.totalCost > 0 });
    game.startGame(store.getCurrentProfile(), { difficulty: difficultySelect.value });
    renderVisibility();
}

// ─── Mail System ──────────────────────────
let _cachedMail = [];
let _mailCountdownInterval = null;
let _mailDelegationBound = false;

function _formatTimeRemaining(ms) {
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

async function fetchMail() {
    const profile = store.getCurrentProfile();
    if (!store.isAuthenticated() || !profile) {
        _cachedMail = [];
        updateMailBadge();
        return _cachedMail;
    }
    try {
        const res = await apiFetch('/mail', {
            method: 'POST',
            body: JSON.stringify({ username: profile.username })
        });
        _cachedMail = res.mail || [];
    } catch (e) {
        console.warn('Mail fetch failed:', e);
    }
    updateMailBadge();
    return _cachedMail;
}

function updateMailBadge() {
    if (!mailButton || !mailBadge) return;
    mailButton.classList.toggle('hidden', !store.isAuthenticated());
    if (!store.isAuthenticated()) return;
    const now = Date.now();
    const unclaimed = _cachedMail.filter(m => !m.claimedAt && !m.expiredAt && (now - m.createdAt) < 86400000).length;
    if (unclaimed > 0) {
        mailBadge.textContent = unclaimed > 99 ? '99+' : unclaimed;
        mailBadge.classList.remove('hidden');
    } else {
        mailBadge.classList.add('hidden');
    }
}

function _startMailCountdowns() {
    if (_mailCountdownInterval) clearInterval(_mailCountdownInterval);
    _mailCountdownInterval = setInterval(() => {
        document.querySelectorAll('.mail-countdown[data-expires-at]').forEach(el => {
            const expiresAt = parseInt(el.dataset.expiresAt, 10);
            const remaining = expiresAt - Date.now();
            if (remaining <= 0) {
                el.textContent = 'Expired';
                el.style.color = '#e53935';
                const mailId = el.closest('.mail-detail')?.querySelector('.mail-claim-btn')?.dataset.mailId
                    || el.closest('.mail-card')?.dataset.mailId;
                if (mailId) {
                    const mailItem = _cachedMail.find(m => m.id === mailId);
                    if (mailItem && !mailItem.expiredAt) {
                        mailItem.expiredAt = Date.now();
                        if (currentView === 'mail') renderMailScreen();
                    }
                }
            } else {
                el.textContent = _formatTimeRemaining(remaining);
            }
        });
    }, 30000);
}

function _stopMailCountdowns() {
    if (_mailCountdownInterval) {
        clearInterval(_mailCountdownInterval);
        _mailCountdownInterval = null;
    }
}

function _bindMailDelegation() {
    if (_mailDelegationBound) return;
    _mailDelegationBound = true;
    mailList.addEventListener('click', (event) => {
        // Card click → open detail
        const card = event.target.closest('.mail-card');
        if (card) {
            const mailId = card.dataset.mailId;
            const mailItem = _cachedMail.find(m => m.id === mailId);
            if (mailItem) renderMailDetail(mailItem);
            return;
        }
        // Back to list
        if (event.target.closest('#mailBackToList')) {
            renderMailScreen();
            return;
        }
        // Claim button
        const claimBtn = event.target.closest('.mail-claim-btn');
        if (claimBtn && !claimBtn.disabled) {
            handleMailClaim(claimBtn);
        }
    });
}

async function handleMailClaim(btn) {
    const mailId = btn.dataset.mailId;
    btn.disabled = true;
    btn.textContent = 'Claiming...';
    try {
        const profile = store.getCurrentProfile();
        const res = await apiFetch('/mail/claim', {
            method: 'POST',
            body: JSON.stringify({ username: profile.username, mailId })
        });
        if (res.ok) {
            store.currentProfile = res.profile;
            await fetchMail();
            // Update just this card's state instead of full re-render
            const mailItem = _cachedMail.find(m => m.id === mailId);
            if (mailItem) {
                mailItem.claimedAt = Date.now();
                renderMailDetail(mailItem);
            } else {
                renderMailScreen();
            }
            renderAuthButton();
            renderTopbarLevelBox();
        } else {
            window.alert(res.message || 'Failed to claim.');
            btn.disabled = false;
            btn.textContent = 'Claim Rewards';
        }
    } catch (e) {
        window.alert('Network error.');
        btn.disabled = false;
        btn.textContent = 'Claim Rewards';
    }
}

function renderMailScreen() {
    // Use cached data immediately — no async fetch needed for rendering
    const profile = store.getCurrentProfile();
    if (store.isAuthenticated() && profile) {
        // Kick off a fresh fetch in the background
        fetchMail().then(() => {
            if (currentView === 'mail') _renderMailList();
        });
    }
    _bindMailDelegation();
    _renderMailList();
}

function _renderMailList() {
    const mail = _cachedMail;
    const now = Date.now();
    const unclaimed = mail.filter(m => !m.claimedAt && !m.expiredAt && (now - m.createdAt) < 86400000).length;
    const expired = mail.filter(m => m.expiredAt && !m.claimedAt).length;
    const claimed = mail.filter(m => m.claimedAt).length;
    const parts = [];
    if (unclaimed) parts.push(`${unclaimed} unclaimed`);
    if (expired) parts.push(`${expired} expired`);
    if (claimed) parts.push(`${claimed} claimed`);
    mailSubtitle.textContent = parts.length ? parts.join(', ') : 'Your mailbox is empty.';

    if (!mail.length) {
        mailList.innerHTML = '<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px 0;font-size:14px">No mail.</div>';
        _stopMailCountdowns();
        return;
    }

    mail.sort((a, b) => {
        if (!a.claimedAt && !a.expiredAt && (b.claimedAt || b.expiredAt)) return -1;
        if ((a.claimedAt || a.expiredAt) && !b.claimedAt && !b.expiredAt) return 1;
        return b.createdAt - a.createdAt;
    });

    mailList.innerHTML = mail.map(m => {
        const isClaimed = !!m.claimedAt;
        const isExpired = !!m.expiredAt || (!m.claimedAt && (now - m.createdAt) >= 86400000);
        const hasRewards = m.rewards && m.rewards.length > 0;
        const cardClass = isExpired ? 'expired' : (isClaimed ? 'claimed' : '');
        let statusTag = '';
        if (isExpired && !isClaimed) {
            statusTag = '<span class="mail-expired-tag">\u23f0 Expired</span>';
        } else if (isClaimed) {
            statusTag = '<span class="mail-claimed-tag">\u2713 Claimed</span>';
        } else if (hasRewards) {
            const expiresAt = m.createdAt + 86400000;
            const remaining = expiresAt - now;
            statusTag = `<span class="mail-timer-tag" data-expires-at="${expiresAt}">\u23f3 ${_formatTimeRemaining(remaining)}</span>`;
        }
        return `<div class="mail-card ${cardClass}" data-mail-id="${m.id}">
            <div class="mail-card-title">${escapeHtml(m.title)}</div>
            <div class="mail-card-preview">${escapeHtml(m.content || '')}</div>
            <div class="mail-card-meta">
                ${hasRewards ? `<span class="mail-reward-tag">\ud83c\udf81 ${m.rewards.length} reward${m.rewards.length > 1 ? 's' : ''}</span>` : ''}
                ${statusTag}
            </div>
        </div>`;
    }).join('');

    _startMailCountdowns();
}

function renderMailDetail(mail) {
    const now = Date.now();
    const isClaimed = !!mail.claimedAt;
    const isExpired = !!mail.expiredAt || (!mail.claimedAt && (now - mail.createdAt) >= 86400000);
    const hasRewards = mail.rewards && mail.rewards.length > 0;
    const expiresAt = mail.createdAt + 86400000;
    const remaining = expiresAt - now;

    let rewardsHtml = '';
    if (hasRewards) {
        rewardsHtml = `<div class="mail-rewards-section">
            <div class="mail-rewards-label">Rewards</div>
            <div class="mail-rewards-grid">
                ${mail.rewards.map(r => {
                    const def = ITEM_DEFS[r.definitionId] || {};
                    const name = def.name || r.definitionId;
                    const img = def.image ? `<img src="${def.image}" alt="${escapeHtml(name)}">` : '';
                    const qty = r.quantity || 1;
                    return `<div class="mail-reward-item">
                        ${img}
                        <div class="mail-reward-name">${escapeHtml(name)}</div>
                        ${qty > 1 ? `<div class="mail-reward-qty">x${qty}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    let actionHtml = '';
    if (hasRewards) {
        if (isExpired && !isClaimed) {
            actionHtml = '<div class="mail-expired-label">Rewards expired \u2014 claim period has passed</div>';
        } else if (isClaimed) {
            actionHtml = '<div class="mail-claimed-label">Rewards claimed</div>';
        } else {
            actionHtml = `<button class="mail-claim-btn" data-mail-id="${mail.id}">Claim Rewards</button>`;
        }
    }

    let countdownHtml = '';
    if (!isClaimed && !isExpired) {
        countdownHtml = `<div class="mail-countdown" data-expires-at="${expiresAt}">Expires in ${_formatTimeRemaining(remaining)}</div>`;
    } else if (isExpired && !isClaimed) {
        countdownHtml = '<div class="mail-countdown" style="color:#e53935">Expired</div>';
    }

    mailList.innerHTML = `<div class="mail-detail">
        <div style="margin-bottom:12px"><button class="secondary-button" id="mailBackToList">\u2190 Back to Mail</button></div>
        <div class="mail-detail-title">${escapeHtml(mail.title)}</div>
        <div class="mail-detail-content">${escapeHtml(mail.content || 'No content.')}</div>
        ${rewardsHtml}
        ${actionHtml}
        ${countdownHtml}
    </div>`;

    _startMailCountdowns();
}

startButton.addEventListener('click', () => {
    startRaidWithSelectedLoadout().catch((error) => {
        window.alert(error.message || 'Failed to start raid.');
    });
});

difficultySelect.addEventListener('change', updateStartButtonDifficultyTheme);

inventoryButton.addEventListener('click', () => setView('inventory'));
marketButton.addEventListener('click', () => setView('market'));
backButton.addEventListener('click', () => setView('menu'));
marketBackButton.addEventListener('click', () => setView('menu'));
placeholderBackButton.addEventListener('click', () => setView('menu'));
mailButton.addEventListener('click', () => setView('mail'));
mailBackButton.addEventListener('click', () => setView('menu'));
placeholderScreen.addEventListener('click', (event) => {
    if (event.target.closest('#placeholderBackButton')) {
        event.preventDefault();
        setView('menu');
        return;
    }

    if (event.target.closest('#claimPlayerLevelRewardButton')) {
        event.preventDefault();
        store.claimNextPlayerLevelReward()
            .then(({ reward }) => {
                renderAll();
                window.alert(formatPlayerLevelRewardToast(reward));
            })
            .catch((error) => {
                window.alert(error.message || 'No player level reward is available.');
            });
    }
});

topbarLeaderboardBox.addEventListener('click', () => {
    openPlaceholderPage('leaderboard');
});

redeemButton.addEventListener('click', async () => {
    const code = window.prompt('Enter redeem code:');
    if (code == null) return;

    const normalized = String(code).trim();
    if (normalized === 'oghyhk') {
        await store.addCoins(10000);
        renderAll();
        window.alert('Redeemed 10000 coins.');
        return;
    }

    if (normalized === '2598') {
        const amountInput = window.prompt('How many coins do you want to get?');
        if (amountInput == null) return;
        const amount = parseWholeNumberInput(amountInput);
        if (amount == null) {
            window.alert('Enter a whole number with no decimal places.');
            return;
        }
        await store.addCoins(amount);
        renderAll();
        window.alert(`Redeemed ${amount} coins.`);
        return;
    }

    window.alert('Invalid redeem code.');
});

authButton.addEventListener('click', () => {
    if (store.isAuthenticated()) {
        toggleAuthDropdown();
        return;
    }
    openAuthModal('login');
});
authDropdown.addEventListener('click', (event) => {
    const button = event.target.closest('[data-topbar-page]');
    if (!button) return;
    openPlaceholderPage(button.dataset.topbarPage);
});
document.addEventListener('click', (event) => {
    if (!authDropdownOpen) return;
    if (authMenuWrap.contains(event.target)) return;
    closeAuthDropdown();
});
loginModeButton.addEventListener('click', () => {
    authMode = 'login';
    renderAuthModal();
});
signupModeButton.addEventListener('click', () => {
    authMode = 'signup';
    renderAuthModal();
});
authClose.addEventListener('click', closeAuthModal);
logoutButton.addEventListener('click', async () => {
    await store.logout();
    currentView = 'menu';
    closeAuthModal();
    closeAuthDropdown();
    renderAll();
});

authModal.addEventListener('click', (event) => {
    if (event.target === authModal) closeAuthModal();
});

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;
    try {
        if (authMode === 'signup') {
            await store.signUp(username, password);
        } else {
            await store.login(username, password);
        }
        closeAuthModal();
        renderAll();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

loadoutSections.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save-loadout-slot]');
    if (saveButton) return;
    const button = event.target.closest('[data-slot][data-item-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.itemId, 'stash');
});

openPresetSaveButton.addEventListener('click', () => {
    openPresetSaveModal();
});

presetSaveClose.addEventListener('click', closePresetSaveModal);

presetSaveModal.addEventListener('click', (event) => {
    if (event.target === presetSaveModal) closePresetSaveModal();
});

chaosStartClose.addEventListener('click', () => resolveChaosStart(false));
chaosStartBack.addEventListener('click', () => resolveChaosStart(false));
chaosStartContinue.addEventListener('click', () => resolveChaosStart(true));
chaosStartModal.addEventListener('click', (event) => {
    if (event.target === chaosStartModal) resolveChaosStart(false);
});

presetSaveOptions.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-loadout-slot]');
    if (!button) return;
    try {
        await store.saveLoadoutPreset(Number(button.dataset.saveLoadoutSlot));
        closePresetSaveModal();
        renderInventory();
        if (currentView === 'menu') renderMenu();
    } catch (error) {
        window.alert(error.message || 'Failed to save loadout.');
    }
});

menuLoadoutButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-loadout-slot]');
    if (!button || button.disabled) return;
    selectedMenuLoadoutSlot = Number(button.dataset.loadoutSlot);
    renderMenu();
});

equipmentCollection.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-slot][data-item-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.itemId, 'stash');
});

itemCollection.addEventListener('click', (event) => {
    const button = event.target.closest('[data-item-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.itemId, 'stash');
});

gunCollection.addEventListener('click', (event) => {
    const button = event.target.closest('[data-item-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.itemId, 'stash');
});

safeboxCollection.addEventListener('click', (event) => {
    const button = event.target.closest('[data-safebox-definition-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.safeboxDefinitionId, 'safebox', Number(button.dataset.safeboxIndex));
});

prepBackpackCollection.addEventListener('click', (event) => {
    const button = event.target.closest('[data-prep-backpack-definition-id]');
    if (!button) return;
    openEquipmentDetail(button.dataset.prepBackpackDefinitionId, 'prep-backpack', Number(button.dataset.prepBackpackIndex));
});

detailClose.addEventListener('click', closeEquipmentDetail);
equipmentDetailModal.addEventListener('click', (event) => {
    if (event.target === equipmentDetailModal) closeEquipmentDetail();
});

detailActions.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-detail-action]');
    if (!button || !activeDetailDefinitionId) return;

    const profile = store.getCurrentProfile();
    const definition = ITEM_DEFS[activeDetailDefinitionId];
    if (!definition) return;

    try {
        if (button.dataset.detailAction === 'equip') {
            await store.updateLoadout(definition.category === 'gun' ? 'gun' : definition.category, definition.id);
            renderAll();
            renderEquipmentDetail('Equipped.');
            return;
        }

        if (button.dataset.detailAction === 'sell') {
            const maxQuantity = getSellableCount(profile, definition.id);
            if (maxQuantity <= 0) {
                renderEquipmentDetail(isAmmoDefinition(definition.id) ? 'No ammo available.' : 'Equip another item first.');
                return;
            }
            const minQuantity = getMinimumTradeQuantity(definition.id, 'sell');
            if (maxQuantity < minQuantity) {
                renderEquipmentDetail(`Trade total must be at least ${MIN_TRADE_TOTAL} coins.`);
                return;
            }
            openTradeModal({
                type: 'inventory-sell',
                definitionId: definition.id,
                title: `Sell ${definition.name}`,
                subtitle: 'Choose how many copies to sell from your stash.',
                minQuantity,
                maxQuantity,
                initialQuantity: minQuantity,
                hint: `Available to sell: ${maxQuantity} · sells for ${formatCoinAmountMarkup(getSellTradeTotal(definition.id, 1))} each · minimum trade ${formatCoinAmountMarkup(MIN_TRADE_TOTAL)}`,
                confirmLabel: 'Sell'
            });
            return;
        }

        if (button.dataset.detailAction === 'safebox') {
            if (isAmmoDefinition(definition.id)) {
                openTradeModal({
                    type: 'stash-to-safebox',
                    definitionId: definition.id,
                    title: 'Pack Ammo into Safebox',
                    subtitle: 'Choose how many rounds to store. Packs are automatically split into bundles of up to 999 rounds.',
                    minQuantity: 1,
                    maxQuantity: getAmmoCountForProfile(profile, definition.id),
                    initialQuantity: Math.min(getAmmoCountForProfile(profile, definition.id), AMMO_PACK_LIMIT),
                    hint: `Available ${definition.name}: ${getAmmoCountForProfile(profile, definition.id)} · ${getEntrySpaceUsed({ definitionId: definition.id })} safebox space per 1-${AMMO_PACK_LIMIT} rounds`,
                    confirmLabel: 'Pack'
                });
                return;
            }
            if (isConsumableDefinition(definition.id)) {
                renderEquipmentDetail('Consumables cannot be stored in the safebox.');
                return;
            }
            await store.moveItemToSafebox(definition.id);
            renderAll();
            renderEquipmentDetail(`${definition.name} moved to safebox.`);
            return;
        }

        if (button.dataset.detailAction === 'prep-backpack') {
            if (isAmmoDefinition(definition.id) || isConsumableDefinition(definition.id)) {
                const availableAmount = isAmmoDefinition(definition.id)
                    ? getAmmoCountForProfile(profile, definition.id)
                    : (getOwnedCounts(profile)[definition.id] || 0);
                openTradeModal({
                    type: 'stash-to-backpack',
                    definitionId: definition.id,
                    title: `Pack ${definition.name} into Backpack`,
                    subtitle: isAmmoDefinition(definition.id)
                        ? 'Choose how many rounds to bring. Packs are automatically split into bundles of up to 999 rounds.'
                        : 'Choose how many consumables to bring. Stacks are automatically split into bundles of up to 999 uses.',
                    minQuantity: 1,
                    maxQuantity: availableAmount,
                    capacity: getInventoryBackpackCapacity(profile),
                    initialQuantity: Math.min(availableAmount, AMMO_PACK_LIMIT),
                    hint: isAmmoDefinition(definition.id)
                        ? `Available ${definition.name}: ${availableAmount} · ${getEntrySpaceUsed({ definitionId: definition.id })} carrying space per 1-${AMMO_PACK_LIMIT} rounds`
                        : `Available ${definition.name}: ${availableAmount} · ${getEntrySpaceUsed({ definitionId: definition.id })} carrying space per 1-${AMMO_PACK_LIMIT} uses`,
                    confirmLabel: 'Pack'
                });
                return;
            }
            await store.moveItemToBackpack(definition.id, getInventoryBackpackCapacity(profile));
            renderAll();
            renderEquipmentDetail(`${definition.name} put in backpack.`);
            return;
        }

        if (button.dataset.detailAction === 'stash') {
            await store.moveSafeboxItemToStash(definition.id, activeDetailEntryIndex);
            renderAll();
            closeEquipmentDetail();
            return;
        }

        if (button.dataset.detailAction === 'backpack-to-stash') {
            await store.moveBackpackItemToStash(definition.id, activeDetailEntryIndex);
            renderAll();
            closeEquipmentDetail();
            return;
        }

        if (button.dataset.detailAction === 'unequip') {
            const equippedSlot = getEquippedLoadoutSlot(profile, definition.id);
            const unequipTargetId = equippedSlot ? getUnequipTargetId(profile, equippedSlot, definition.id) : null;
            if (!unequipTargetId) {
                renderEquipmentDetail('No replacement item available.');
                return;
            }
            await store.updateLoadout(equippedSlot, unequipTargetId === '__empty__' ? null : unequipTargetId);
            renderAll();
            renderEquipmentDetail('Unequipped.');
        }
    } catch (error) {
        renderEquipmentDetail(error.message);
    }
});

marketSections.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-market-action][data-item-id]');
    if (!button) return;
    const profile = store.getCurrentProfile();
    const definition = ITEM_DEFS[button.dataset.itemId];
    if (!definition) return;

    if (button.dataset.marketAction === 'buy') {
        const maxQuantity = getMaxAffordableQuantity(profile, definition.id);
        const minQuantity = getMinimumTradeQuantity(definition.id, 'buy');
        if (maxQuantity < minQuantity) {
            setMarketMessage('Not enough coins.', true);
            return;
        }
        openTradeModal({
            type: 'market-buy',
            definitionId: definition.id,
            title: `Buy ${definition.name}`,
            subtitle: 'Enter how many copies to purchase.',
            minQuantity,
            maxQuantity,
            initialQuantity: minQuantity,
            hint: `Budget allows up to ${maxQuantity} · costs ${formatCoinAmountMarkup(getBuyTradeTotal(definition.id, 1))} each · minimum trade ${formatCoinAmountMarkup(MIN_TRADE_TOTAL)}`,
            confirmLabel: 'Buy'
        });
    } else {
        const maxQuantity = getSellableCount(profile, definition.id);
        const minQuantity = getMinimumTradeQuantity(definition.id, 'sell');
        if (maxQuantity < minQuantity) {
            setMarketMessage('Nothing available to sell.', true);
            return;
        }
        openTradeModal({
            type: 'market-sell',
            definitionId: definition.id,
            title: `Sell ${definition.name}`,
            subtitle: 'Enter how many copies to sell.',
            minQuantity,
            maxQuantity,
            initialQuantity: minQuantity,
            hint: `Available to sell: ${maxQuantity} · sells for ${formatCoinAmountMarkup(getSellTradeTotal(definition.id, 1))} each · minimum trade ${formatCoinAmountMarkup(MIN_TRADE_TOTAL)}`,
            confirmLabel: 'Sell'
        });
    }
});

marketTypeNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-market-nav]');
    if (!button) return;
    const section = document.getElementById(`market-section-${button.dataset.marketNav}`);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

tradeClose.addEventListener('click', closeTradeModal);
tradeModal.addEventListener('click', (event) => {
    if (event.target === tradeModal) closeTradeModal();
});

function syncTradeQuantity(rawValue) {
    if (!activeTradeRequest) return;
    const minQuantity = Math.max(1, Number(activeTradeRequest.minQuantity) || 1);
    const maxQuantity = Math.max(minQuantity, Number(activeTradeRequest.maxQuantity) || minQuantity);
    const quantity = Math.max(minQuantity, Math.min(maxQuantity, Math.floor(Number(rawValue) || minQuantity)));
    tradeQuantity.value = String(quantity);
    tradeQuantitySlider.value = String(quantity);
    tradeMessage.textContent = '';
}

tradeQuantity.addEventListener('input', () => {
    syncTradeQuantity(tradeQuantity.value);
});

tradeQuantitySlider.addEventListener('input', () => {
    syncTradeQuantity(tradeQuantitySlider.value);
});

tradeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeTradeRequest) return;

    const minQuantity = Math.max(1, Number(activeTradeRequest.minQuantity) || 1);
    const quantity = Math.max(minQuantity, Math.floor(Number(tradeQuantity.value) || 0));
    if (quantity < minQuantity) {
        tradeMessage.textContent = `Minimum allowed is ${minQuantity}.`;
        return;
    }
    if (quantity > activeTradeRequest.maxQuantity) {
        tradeMessage.textContent = `Maximum allowed is ${activeTradeRequest.maxQuantity}.`;
        return;
    }

    try {
        const definition = ITEM_DEFS[activeTradeRequest.definitionId];
        if (!definition) throw new Error('Item not found.');

        if (activeTradeRequest.type === 'market-buy') {
            await store.buyItem(activeTradeRequest.definitionId, quantity);
            setMarketMessage(`Purchased x${quantity} ${definition.name}.`);
            renderAll();
            closeTradeModal();
            return;
        }

        if (activeTradeRequest.type === 'market-sell') {
            await store.sellItem(activeTradeRequest.definitionId, quantity);
            setMarketMessage(`Sold x${quantity} ${definition.name}.`);
            renderAll();
            closeTradeModal();
            return;
        }

        if (activeTradeRequest.type === 'inventory-sell') {
            await store.sellItem(activeTradeRequest.definitionId, quantity);
            renderAll();
            closeTradeModal();
            if (!equipmentDetailModal.classList.contains('hidden') && activeDetailDefinitionId === activeTradeRequest.definitionId) {
                renderEquipmentDetail(`Sold x${quantity} ${definition.name}.`);
            }
            return;
        }

        if (activeTradeRequest.type === 'stash-to-backpack') {
            await store.moveItemToBackpack(activeTradeRequest.definitionId, activeTradeRequest.capacity, quantity);
            renderAll();
            closeTradeModal();
            if (!equipmentDetailModal.classList.contains('hidden') && activeDetailDefinitionId === activeTradeRequest.definitionId) {
                const packCount = Math.ceil(quantity / AMMO_PACK_LIMIT);
                const usedSpace = packCount * getEntrySpaceUsed({ definitionId: activeTradeRequest.definitionId });
                renderEquipmentDetail(`Packed ${quantity} ${isAmmoDefinition(activeTradeRequest.definitionId) ? 'ammo' : 'consumable'} into backpack (${usedSpace} carrying space).`);
            }
            return;
        }

        if (activeTradeRequest.type === 'stash-to-safebox') {
            await store.moveItemToSafebox(activeTradeRequest.definitionId, quantity);
            renderAll();
            closeTradeModal();
            if (!equipmentDetailModal.classList.contains('hidden') && activeDetailDefinitionId === activeTradeRequest.definitionId) {
                const packCount = Math.ceil(quantity / AMMO_PACK_LIMIT);
                const usedSpace = packCount * getEntrySpaceUsed({ definitionId: activeTradeRequest.definitionId });
                renderEquipmentDetail(`Packed ${quantity} ${isAmmoDefinition(activeTradeRequest.definitionId) ? 'ammo' : 'item'} into safebox (${usedSpace} carrying space).`);
            }
            return;
        }
    } catch (error) {
        tradeMessage.textContent = error.message;
    }
});

crateItems.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('[data-crate-item-id]');
    if (!button) return;
    game.takeItemFromOpenCrate(button.dataset.crateItemId);
    renderRuntimeUi();
});

raidLoadoutItems.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('[data-raid-source="loadout"][data-slot]');
    if (!button) return;
    openRaidDetail('loadout', button.dataset.slot);
});

raidBackpackItems.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('[data-raid-source="backpack"][data-item-id]');
    if (!button) return;
    openRaidDetail('backpack', button.dataset.itemId);
});

raidSafeboxItems.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('[data-raid-source="safebox"][data-item-id]');
    if (!button) return;
    openRaidDetail('safebox', button.dataset.itemId);
});

raidDetailClose.addEventListener('click', closeRaidDetail);
raidDetailModal.addEventListener('click', (event) => {
    if (event.target === raidDetailModal) closeRaidDetail();
});

raidDetailActions.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest('[data-raid-action]');
    if (!button || !activeRaidDetail) return;

    let result = null;
    if (activeRaidDetail.source === 'backpack') {
        if (button.dataset.raidAction === 'equip') {
            result = game.equipBackpackItem(activeRaidDetail.identifier);
        } else if (button.dataset.raidAction === 'to-safebox') {
            result = game.moveBackpackItemToSafebox(activeRaidDetail.identifier);
        } else if (button.dataset.raidAction === 'abandon') {
            result = game.abandonBackpackItem(activeRaidDetail.identifier);
        }
    } else if (activeRaidDetail.source === 'safebox') {
        if (button.dataset.raidAction === 'to-backpack') {
            result = game.moveSafeboxItemToBackpack(activeRaidDetail.identifier);
        }
    } else {
        if (button.dataset.raidAction === 'unequip') {
            result = game.unequipLoadoutItem(activeRaidDetail.identifier);
        } else if (button.dataset.raidAction === 'abandon') {
            result = game.abandonLoadoutItem(activeRaidDetail.identifier);
        }
    }

    renderRuntimeUi();
    if (!result) return;
    if (result.ok) {
        closeRaidDetail();
    } else {
        renderRaidDetail(result.message);
    }
});

function uiLoop() {
    renderRuntimeUi();
    requestAnimationFrame(uiLoop);
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeDevConfig();
    await store.init();
    updateStartButtonDifficultyTheme();
    renderAll();
    uiLoop();
    setTimeout(() => {
        loading.classList.add('hidden');
        setTimeout(() => loading.remove(), 300);
    }, 200);
});

window.addEventListener('focus', () => {
    if (game.state === GAME_STATE.MENU) {
        scheduleRuntimeConfigRefresh(true);
    }
});

setInterval(() => {
    if (document.visibilityState === 'visible' && game.state === GAME_STATE.MENU) {
        scheduleRuntimeConfigRefresh();
    }
}, 2000);
