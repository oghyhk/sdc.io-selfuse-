// ============================================================
// app.js — DOM UI for menu, inventory, auth, market, and crate loot panel
// ============================================================

import { Game, GAME_STATE } from './game.js';
import {
    ProfileStore,
    LOADOUT_SLOTS,
    ITEM_DEFS,
    RARITY_ORDER,
    getOwnedItemsByCategory,
    getRarityMeta,
    getSlotLabel,
    summarizeProfile,
    getStashSummary
} from './profile.js';

const store = new ProfileStore();

const canvas = document.getElementById('gameCanvas');
const loading = document.getElementById('loading');
const topBar = document.getElementById('topBar');
const authButton = document.getElementById('authButton');
const menuScreen = document.getElementById('menuScreen');
const inventoryScreen = document.getElementById('inventoryScreen');
const marketScreen = document.getElementById('marketScreen');
const menuSummary = document.getElementById('menuSummary');
const inventoryCoins = document.getElementById('inventoryCoins');
const inventoryStats = document.getElementById('inventoryStats');
const loadoutSections = document.getElementById('loadoutSections');
const stashSummary = document.getElementById('stashSummary');
const runHistory = document.getElementById('runHistory');
const marketCoins = document.getElementById('marketCoins');
const marketGrid = document.getElementById('marketGrid');
const marketMessage = document.getElementById('marketMessage');
const startButton = document.getElementById('startButton');
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
const authClose = document.getElementById('authClose');
const logoutButton = document.getElementById('logoutButton');
const accountActions = document.getElementById('accountActions');
const cratePanel = document.getElementById('cratePanel');
const cratePrompt = document.getElementById('cratePrompt');
const crateItems = document.getElementById('crateItems');
const crateMessage = document.getElementById('crateMessage');

let currentView = 'menu';
let authMode = 'login';

const game = new Game(canvas, {
    onStateChange: handleGameState,
    onExtraction: async (summary) => {
        await store.recordExtraction(summary);
        renderAll();
    }
});

function formatDate(iso) {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function setView(view) {
    currentView = view;
    renderVisibility();
    if (view === 'inventory') renderInventory();
    else if (view === 'market') renderMarket();
    else renderMenu();
}

function renderVisibility() {
    const showOverlay = game.state === GAME_STATE.MENU;
    topBar.classList.toggle('hidden', !showOverlay);
    menuScreen.classList.toggle('hidden', !showOverlay || currentView !== 'menu');
    inventoryScreen.classList.toggle('hidden', !showOverlay || currentView !== 'inventory');
    marketScreen.classList.toggle('hidden', !showOverlay || currentView !== 'market');
    document.body.classList.toggle('playing', game.state === GAME_STATE.PLAYING);
}

function renderAuthButton() {
    const profile = store.getCurrentProfile();
    authButton.textContent = store.isAuthenticated()
        ? `${profile.username} · ${profile.coins} coins`
        : 'Login / Sign Up';
}

function renderMenu() {
    const profile = store.getCurrentProfile();
    const summary = summarizeProfile(profile);
    const loadoutText = LOADOUT_SLOTS.map((slot, index) => `${getSlotLabel(slot)}: ${summary.loadoutNames[index]}`).join(' · ');

    menuSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Operator</span><strong>${profile.username}</strong></div>
        <div class="summary-tile"><span class="summary-label">Coins</span><strong>${summary.coins}</strong></div>
        <div class="summary-tile"><span class="summary-label">Extractions</span><strong>${summary.extractedRuns}</strong></div>
        <div class="summary-tile"><span class="summary-label">Last Haul</span><strong>${summary.lastExtractItemCount} items</strong></div>
        <div class="summary-tile summary-wide"><span class="summary-label">Active Loadout</span><strong>${loadoutText}</strong></div>
    `;
}

function renderLoadoutSections(profile) {
    loadoutSections.innerHTML = LOADOUT_SLOTS.map((slot) => {
        const ownedItems = getOwnedItemsByCategory(profile, slot);
        const selectedId = profile.loadout[slot];
        const cards = ownedItems.length
            ? ownedItems.map(({ definition, count }) => {
                const rarity = getRarityMeta(definition.rarity);
                const selected = selectedId === definition.id;
                return `
                    <button class="item-card ${selected ? 'active' : ''}" data-slot="${slot}" data-item-id="${definition.id}">
                        <div class="item-card-header">
                            <strong>${definition.name}</strong>
                            <span style="color:${rarity.color}">${rarity.label}</span>
                        </div>
                        <p>${definition.description}</p>
                        <div class="item-stats">
                            <span>${selected ? 'Equipped' : 'Equip'}</span>
                            <span>Owned ${count}</span>
                            <span>Value ${definition.sellValue}c</span>
                        </div>
                    </button>
                `;
            }).join('')
            : '<div class="empty-state">No extracted items in this slot yet.</div>';

        return `
            <section class="inventory-section loadout-slot-section">
                <h3>${getSlotLabel(slot)}</h3>
                <div class="item-list">${cards}</div>
            </section>
        `;
    }).join('');
}

function renderStash(profile) {
    const stash = getStashSummary(profile);
    const rarityTiles = RARITY_ORDER.map((rarity) => {
        const meta = getRarityMeta(rarity);
        return `<div class="summary-tile"><span class="summary-label">${meta.label}</span><strong style="color:${meta.color}">${stash[rarity]}</strong></div>`;
    }).join('');

    stashSummary.innerHTML = `
        <div class="summary-tile"><span class="summary-label">Coins</span><strong>${profile.coins}</strong></div>
        <div class="summary-tile"><span class="summary-label">Stored Items</span><strong>${stash.items}</strong></div>
        ${rarityTiles}
    `;

    inventoryCoins.textContent = `${profile.coins}c`;
    inventoryStats.textContent = `Runs ${profile.stats.totalExtractions} · Kills ${profile.stats.totalKills}`;

    if (!profile.extractedRuns.length) {
        runHistory.innerHTML = '<div class="empty-state">No successful extractions yet.</div>';
        return;
    }

    runHistory.innerHTML = profile.extractedRuns.map((run) => {
        const itemText = (run.items || []).map((item) => item.name).slice(0, 4).join(', ');
        return `
            <div class="run-card">
                <div class="run-card-row">
                    <strong>Extraction</strong>
                    <span>${run.items?.length || 0} items</span>
                </div>
                <div class="run-card-row muted">
                    <span>${formatDate(run.createdAt)}</span>
                    <span>${run.kills} kills · ${run.durationLabel}</span>
                </div>
                <div class="run-card-row muted">
                    <span>${ITEM_DEFS[run.loadout?.gun]?.name || run.weaponName}</span>
                    <span>${itemText || 'No items'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderInventory() {
    const profile = store.getCurrentProfile();
    renderLoadoutSections(profile);
    renderStash(profile);
}

function renderMarket() {
    const profile = store.getCurrentProfile();
    const ownedCounts = {};
    for (const item of profile.stashItems || []) {
        ownedCounts[item.definitionId] = (ownedCounts[item.definitionId] || 0) + 1;
    }
    marketCoins.textContent = `${profile.coins}c`;
    marketGrid.innerHTML = Object.values(ITEM_DEFS)
        .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.category.localeCompare(b.category))
        .map((item) => {
            const rarity = getRarityMeta(item.rarity);
            const owned = ownedCounts[item.id] || 0;
            return `
                <div class="market-card" style="border-left:4px solid ${rarity.color}">
                    <div class="item-card-header">
                        <strong>${item.name}</strong>
                        <span style="color:${rarity.color}">${rarity.label}</span>
                    </div>
                    <p>${item.description}</p>
                    <div class="item-stats">
                        <span>${getSlotLabel(item.category)}</span>
                        <span>Price ${item.sellValue}c</span>
                        <span>Owned ${owned}</span>
                    </div>
                    <div class="market-actions">
                        <button class="secondary-button" data-market-action="sell" data-item-id="${item.id}" ${owned ? '' : 'disabled'}>Sell</button>
                        <button class="primary-button" data-market-action="buy" data-item-id="${item.id}" ${profile.coins >= item.sellValue ? '' : 'disabled'}>Buy</button>
                    </div>
                </div>
            `;
        }).join('');
}

function renderAuthModal() {
    const profile = store.getCurrentProfile();
    loginModeButton.classList.toggle('active', authMode === 'login');
    signupModeButton.classList.toggle('active', authMode === 'signup');

    if (store.isAuthenticated()) {
        authTitle.textContent = `Signed in as ${profile.username}`;
        authMessage.textContent = 'User data is stored in a local JSON file through the prototype API server.';
        authForm.classList.add('hidden');
        accountActions.classList.remove('hidden');
        return;
    }

    authTitle.textContent = authMode === 'login' ? 'Login' : 'Create Account';
    authMessage.textContent = authMode === 'login'
        ? 'Access your saved stash, loadout, and market balance.'
        : 'Create a local account saved to the local prototype user-data file.';
    authSubmit.textContent = authMode === 'login' ? 'Login' : 'Sign Up';
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
    const crateState = game.getOpenCrateView();
    cratePanel.classList.toggle('hidden', !crateState.visible);

    if (!crateState.visible) {
        cratePrompt.textContent = '';
        crateItems.innerHTML = '';
        crateMessage.textContent = '';
        return;
    }

    cratePrompt.textContent = `Crate open · ${crateState.crate.itemCount} item(s) · click an item to take it`;
    crateMessage.textContent = crateState.message || '';

    crateItems.innerHTML = crateState.crate.items.length
        ? crateState.crate.items.map((item) => `
            <button class="crate-item-card" data-crate-item-id="${item.id}" style="border-left:4px solid ${item.rarityColor}">
                <div class="item-card-header">
                    <strong>${item.name}</strong>
                    <span style="color:${item.rarityColor}">${item.rarityLabel}</span>
                </div>
                <p>${item.description}</p>
                <div class="item-stats">
                    <span>${getSlotLabel(item.category)}</span>
                    <span>Value ${item.sellValue}c</span>
                    <span>Click to take</span>
                </div>
            </button>
        `).join('')
        : '<div class="empty-state">Crate already cleared.</div>';
}

function renderAll() {
    renderAuthButton();
    renderMenu();
    renderInventory();
    renderMarket();
    renderVisibility();
    if (!authModal.classList.contains('hidden')) {
        renderAuthModal();
    }
}

function handleGameState(state) {
    if (state === GAME_STATE.MENU) {
        currentView = 'menu';
    }
    renderAll();
}

startButton.addEventListener('click', () => {
    game.startGame(store.getCurrentProfile());
    renderVisibility();
});

inventoryButton.addEventListener('click', () => setView('inventory'));
marketButton.addEventListener('click', () => setView('market'));
backButton.addEventListener('click', () => setView('menu'));
marketBackButton.addEventListener('click', () => setView('menu'));

authButton.addEventListener('click', () => openAuthModal('login'));
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
    closeAuthModal();
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
        if (authMode === 'login') await store.login(username, password);
        else await store.signUp(username, password);
        closeAuthModal();
        renderAll();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

loadoutSections.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-slot][data-item-id]');
    if (!button) return;
    await store.updateLoadout(button.dataset.slot, button.dataset.itemId);
    renderAll();
});

marketGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-market-action][data-item-id]');
    if (!button) return;
    try {
        if (button.dataset.marketAction === 'buy') {
            await store.buyItem(button.dataset.itemId);
            setMarketMessage('Item purchased.');
        } else {
            await store.sellItem(button.dataset.itemId);
            setMarketMessage('Item sold.');
        }
        renderAll();
    } catch (error) {
        setMarketMessage(error.message, true);
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

function uiLoop() {
    renderRuntimeUi();
    requestAnimationFrame(uiLoop);
}

window.addEventListener('DOMContentLoaded', async () => {
    await store.init();
    renderAll();
    uiLoop();
    setTimeout(() => {
        loading.classList.add('hidden');
        setTimeout(() => loading.remove(), 300);
    }, 200);
});
