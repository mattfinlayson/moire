// preset-import.js - Handle external preset importing

const IMPORT_DB_NAME = 'ImportedPresetsDB';
const IMPORT_DB_VERSION = 2;
const IMPORT_STORE_NAME = 'imported_presets';

// ===== PRESET UNLOCK GAME =====

const UNLOCK_GAME_KEY = 'r1_preset_unlock_game';
const STARTER_PRESETS = ['CARICATURE', 'IMPRESSIONISM'];

function loadUnlockState() {
  try {
    const raw = localStorage.getItem(UNLOCK_GAME_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (!state.credits) state.credits = 0;
      if (!state.creditEarnedPresets) state.creditEarnedPresets = [];
      // MIGRATION: ensure all starter presets are unlocked for existing users
      let migrated = false;
      STARTER_PRESETS.forEach(name => {
        if (!state.unlockedPresets.includes(name)) {
          state.unlockedPresets.push(name);
          migrated = true;
        }
      });
      if (migrated) {
        try { localStorage.setItem(UNLOCK_GAME_KEY, JSON.stringify(state)); } catch (e) {}
      }
      return state;
    }
  } catch (e) {}
  return { credits: 0, creditEarnedPresets: [], unlockedPresets: [...STARTER_PRESETS] };
}

function saveUnlockState(state) {
  try {
    localStorage.setItem(UNLOCK_GAME_KEY, JSON.stringify(state));
  } catch (e) {}
}

export function earnCredit(importedPresetName) {
  const state = loadUnlockState();
  if (!state.creditEarnedPresets) state.creditEarnedPresets = [];
  if (state.creditEarnedPresets.includes(importedPresetName)) {
    return false;
  }
  state.credits = (state.credits || 0) + 1;
  state.creditEarnedPresets.push(importedPresetName);
  saveUnlockState(state);
  return true;
}

export function unlockPresetWithCredit(presetName) {
  const state = loadUnlockState();
  if ((state.credits || 0) < 1) return false;
  state.credits -= 1;
  if (!state.unlockedPresets.includes(presetName)) {
    state.unlockedPresets.push(presetName);
  }
  state.lastUnlocked = presetName;
  saveUnlockState(state);
  return true;
}

export function unlockAllPresets(allAvailablePresets) {
  const state = loadUnlockState();
  if (state.cheatActivated) {
    // Second use — re-lock everything that was unlocked only by the cheat
    state.unlockedPresets = state.preCheatUnlockedPresets || [...STARTER_PRESETS];
    state.cheatActivated = false;
    state.preCheatUnlockedPresets = null;
    saveUnlockState(state);
    return false; // signals "re-locked"
  } else {
    // First use — save current list, then unlock everything
    state.preCheatUnlockedPresets = [...state.unlockedPresets];
    allAvailablePresets.forEach(p => {
      if (!state.unlockedPresets.includes(p.name)) {
        state.unlockedPresets.push(p.name);
      }
    });
    state.cheatActivated = true;
    saveUnlockState(state);
    return true; // signals "unlocked"
  }
}

export function getCredits() {
  return loadUnlockState().credits || 0;
}

// ===== END PRESET UNLOCK GAME =====

export class PresetImporter {
  constructor() {
    this.db = null;
    this.importedPresets = [];
    this.isImportModalOpen = false;
    this.currentImportScrollIndex = 0;
    this.importFilterText = '';
    this.checkboxStates = new Map(); // Track checkbox states across filters

    // Audio system for reading preset messages
    this.isMuted = false;

    this.speakMessage = (text) => {
      if (this.isMuted) return;
      // Take only the first sentence, capped at 200 characters, so the R1 finishes quickly
      const firstSentence = text.split(/[.!?\n]/)[0].trim().substring(0, 200);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (typeof PluginMessageHandler !== 'undefined') {
        PluginMessageHandler.postMessage(JSON.stringify({
          message: firstSentence,
          wantsR1Response: true
        }));
      } else if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(firstSentence);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    };

    this.stopSpeaking = () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IMPORT_DB_NAME, IMPORT_DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(IMPORT_STORE_NAME)) {
          db.createObjectStore(IMPORT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async loadImportedPresets() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([IMPORT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(IMPORT_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        this.importedPresets = request.result.map(r => r.preset);
        resolve(this.importedPresets);
      };
      request.onerror = () => {
        console.error('Error loading imported presets:', request.error);
        resolve([]);
      };
    });
  }

  async saveImportedPresets(presets) {
    if (!this.db) {
      await this.init();
    }

    return new Promise(async (resolve, reject) => {
      const transaction = this.db.transaction([IMPORT_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(IMPORT_STORE_NAME);
      
      // Clear existing
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        // Add new presets
        const addPromises = presets.map(preset => {
          return new Promise((res, rej) => {
            const addRequest = store.add({ preset });
            addRequest.onsuccess = () => res();
            addRequest.onerror = () => rej(addRequest.error);
          });
        });

        Promise.all(addPromises)
          .then(() => {
            this.importedPresets = presets;
            resolve();
          })
          .catch(reject);
      };

      clearRequest.onerror = () => reject(clearRequest.error);
    });
  }

  async loadPresetsFromFile() {
    // If already loaded this session, return the cached copy instantly
    if (window._cachedFactoryPresets) {
      return window._cachedFactoryPresets;
    }
    try {
      const response = await fetch('./presets.json');
      if (!response.ok) {
        throw new Error('Failed to load presets.json');
      }
      
      const presets = await response.json();
      
      const validPresets = presets.filter(p => 
        p.name && Array.isArray(p.category)
      );

      // Alphabetize presets by name
      const sorted = validPresets.sort((a, b) => a.name.localeCompare(b.name));

      // Store in memory so every other call this session skips the download
      window._cachedFactoryPresets = sorted;
      return sorted;
    } catch (error) {
      console.error('Error loading presets.json:', error);
      throw new Error('Could not load presets.json file');
    }
  }

  buildPresetIndex(availablePresets) {
    // Build imported presets map once — O(n) instead of O(n²) per keypress
    const importedMap = new Map(this.importedPresets.map(p => [p.name, p]));

    const newPresets = [];
    const updatedPresets = [];
    const normalPresets = [];

    availablePresets.forEach(preset => {
      const existing = importedMap.get(preset.name);
      if (!existing) {
        newPresets.push(preset);
      } else if (existing.message !== preset.message) {
        updatedPresets.push(preset);
      } else {
        normalPresets.push(preset);
      }
    });

    // Load unlock state so we can sort unlocked-but-not-imported presets to the top
    const unlockState = loadUnlockState();
    const unlockedNames = new Set(unlockState.unlockedPresets);
    const lastUnlocked = unlockState.lastUnlocked || null;

    newPresets.sort((a, b) => {
      // Most recently unlocked preset goes first
      if (a.name === lastUnlocked) return -1;
      if (b.name === lastUnlocked) return 1;
      // Then other unlocked-but-not-imported presets (alphabetical)
      const aUnlocked = unlockedNames.has(a.name);
      const bUnlocked = unlockedNames.has(b.name);
      if (aUnlocked && !bUnlocked) return -1;
      if (!aUnlocked && bUnlocked) return 1;
      // For new users with no imports yet, put starter presets first (in array order)
      if (this.importedPresets.length === 0) {
        const aIdx = STARTER_PRESETS.indexOf(a.name);
        const bIdx = STARTER_PRESETS.indexOf(b.name);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx; // both starters — use array order
        if (aIdx !== -1) return -1; // only a is a starter
        if (bIdx !== -1) return 1;  // only b is a starter
      }
      return a.name.localeCompare(b.name);
    });
    updatedPresets.sort((a, b) => a.name.localeCompare(b.name));
    normalPresets.sort((a, b) => a.name.localeCompare(b.name));

    this._sortedPresets = [...newPresets, ...updatedPresets, ...normalPresets];

    // Pre-build lowercase search strings once — reused on every keypress
    this._searchIndex = this._sortedPresets.map(preset => {
      const name = preset.name.toLowerCase();
      const message = (preset.message || '').toLowerCase();
      const cats = Array.isArray(preset.category) ? preset.category.join(' ').toLowerCase() : '';
      const opts = Array.isArray(preset.options) ? preset.options.map(o => o.text || '').join(' ').toLowerCase() : '';
      const groupOpts = Array.isArray(preset.optionGroups) ? preset.optionGroups.map(g => (g.title || '') + ' ' + (g.options ? g.options.map(o => o.text || '').join(' ') : '')).join(' ').toLowerCase() : '';
      return name + ' ' + message + ' ' + cats + ' ' + opts + ' ' + groupOpts;
    });
  }

  getFilteredPresets(availablePresets) {
    // Build index only if not yet built for this session
    if (!this._sortedPresets) {
      this.buildPresetIndex(availablePresets);
    }

    if (!this.importFilterText.trim()) {
      return this._sortedPresets;
    }

    const filterLower = this.importFilterText.toLowerCase();
    return this._sortedPresets.filter((preset, i) =>
      this._searchIndex[i].includes(filterLower)
    );
  }

  async showPresetSelectionUI(availablePresets) {
    return new Promise((resolve) => {
      this.isImportModalOpen = true;
      this.currentImportScrollIndex = 0;
      this.importFilterText = '';
      this._sortedPresets = null;
      this._searchIndex = null;
      
      // Load the unlock game state for this session
      const unlockState = loadUnlockState();
      const unlockedNames = new Set(unlockState.unlockedPresets);

      // Initialize checkbox states - mark currently imported presets as checked
      this.checkboxStates.clear();
      availablePresets.forEach(preset => {
        const isAlreadyImported = this.importedPresets.some(p => p.name === preset.name);
        this.checkboxStates.set(preset.name, isAlreadyImported);
      });

      const modal = document.createElement('div');
      modal.className = 'styles-menu';
      modal.style.display = 'flex';
      modal.style.zIndex = '10000';
      modal.id = 'import-preset-modal';

      const content = document.createElement('div');
      content.className = 'styles-menu-content';

      const header = document.createElement('div');
      header.className = 'styles-menu-header';
      header.style.marginBottom = '0'; // Ensure no gap below header
      const currentCredits = loadUnlockState().credits || 0;
      header.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1px; line-height:1.1;">
          <h2 style="font-size: 14px; margin:0; padding:0;">Import (<span id="import-preset-count">${availablePresets.length}</span>)</h2>
          <span id="import-credits-display" style="font-size:10px; color:#aaa; margin:0; padding:0;">Credits: ${currentCredits}</span>
        </div>
        <div class="menu-nav-buttons">
          <button id="import-mute-toggle" class="menu-jump-button" title="Mute/Unmute">${this.isMuted ? '🔇' : '🔊'}</button>          
          <button id="import-jump-to-top" class="menu-jump-button" title="Jump to top">↑</button>
          <button id="import-jump-to-bottom" class="menu-jump-button" title="Jump to bottom">↓</button>
          <button id="close-import-modal" class="close-button">×</button>
        </div>
      `;

      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'styles-menu-scroll-container';
      scrollContainer.id = 'import-scroll-container';
      scrollContainer.style.paddingTop = '0'; // Remove top padding to close gap
      scrollContainer.style.paddingBottom = '22px';

      // Filter input (sticky at top, immediately below header)
      const filterSection = document.createElement('div');
      filterSection.className = 'menu-section';
      filterSection.style.cssText = 'position: sticky; top: 0; background: #1a1a1a; z-index: 10; padding: 5px 0; margin: 0; border-bottom: 1px solid #333;';
      filterSection.innerHTML = `
        <div class="filter-row" style="margin: 0; padding-right: calc(8vw + 2vw);">
          <input type="text" id="import-preset-filter" class="style-filter" placeholder="Filter..." style="margin: 0; height: 24px; font-size: 12px;">
          <button class="filter-blur-btn" id="import-filter-blur-btn" title="Dismiss keyboard">×</button>
        </div>
        <div id="import-lock-message" style="display:none; background:#8B0000; color:#fff; font-size:11px; padding:5px 10px; margin-top:3px; border-radius:3px; text-align:center;"></div>
      `;

      // Helper to show a message inside the import modal (avoids z-index conflicts)
      let lockMessageTimer = null;
      const showImportMessage = (text) => {
        const msgEl = document.getElementById('import-lock-message');
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.style.display = 'block';
        if (lockMessageTimer) clearTimeout(lockMessageTimer);
        lockMessageTimer = setTimeout(() => {
          msgEl.style.display = 'none';
        }, 3000);
      };

      const presetsSection = document.createElement('div');
      presetsSection.className = 'menu-section';
      presetsSection.id = 'import-presets-section';
      presetsSection.style.margin = '0';
      
      const presetsList = document.createElement('div');
      presetsList.className = 'menu-list';
      presetsList.id = 'import-presets-list';

      const renderPresetsList = () => {
        const filteredPresets = this.getFilteredPresets(availablePresets);
        const countElement = document.getElementById('import-preset-count');
        if (countElement) countElement.textContent = filteredPresets.length;

        // --- Pre-build O(1) lookup maps once per render ---

        const importedMap = new Map(this.importedPresets.map(p => [p.name, p]));
        const availableSet = new Set(availablePresets.map(p => p.name));

        // Fast credit count: count checked locked presets using Maps
        const getLockedCheckedCount = () => {
          let count = 0;
          this.checkboxStates.forEach((checked, name) => {
            if (!checked) return;
            if (!availableSet.has(name)) return;
            if (importedMap.has(name)) return; // already imported = not locked
            if (unlockedNames.has(name)) return; // unlocked = not locked
            count++;
          });
          return count;
        };

        // Build all items into a fragment — single DOM write at the end

        const fragment = document.createDocumentFragment();

        filteredPresets.forEach((preset, index) => {
          const isAlreadyImported = importedMap.has(preset.name);
          const isLocked = !isAlreadyImported && !unlockedNames.has(preset.name);
          const existingPreset = importedMap.get(preset.name);

          const msg = preset.message || '';
          const periodIndex = msg.indexOf('.');
          const firstLine = periodIndex !== -1 ? msg.substring(0, periodIndex + 1).trim() : msg.substring(0, 160).trim();

          const item = document.createElement('button');
          item.className = 'menu-item';
          item.dataset.presetIndex = index;
          item.dataset.presetName = preset.name;
          item.style.cssText = 'display: flex; align-items: flex-start; padding: 6px 15px; width: 100%; justify-content: flex-start; margin-bottom: 2px;';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `import-preset-${index}`;
          checkbox.checked = this.checkboxStates.get(preset.name) || false;
          checkbox.style.cssText = 'width:18px;height:18px;min-width:18px;min-height:18px;margin-right:10px;cursor:pointer;accent-color:#4CAF50;flex-shrink:0;';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'menu-item-name';
          nameSpan.style.cssText = 'flex: 1; text-align: left; overflow: hidden; font-size: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 1px;';

          const nameRow = document.createElement('span');
          nameRow.textContent = preset.name;
          nameRow.style.cssText = 'font-weight: bold; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; display: flex; align-items: center;';

          const previewRow = document.createElement('span');
          previewRow.textContent = firstLine;
          previewRow.style.cssText = 'font-weight: normal; color: #fff; font-size: 10px; width: 100%; white-space: normal; word-break: break-word;';
          previewRow.className = 'import-preview-row';

          nameSpan.appendChild(nameRow);
          nameSpan.appendChild(previewRow);

          // NEW / UPDATED tickets

          if (!existingPreset) {
            const ticket = document.createElement('span');
            ticket.className = 'preset-ticket preset-ticket-new';
            ticket.textContent = 'NEW';
            nameRow.appendChild(ticket);
          } else if (existingPreset.message !== preset.message) {
            const ticket = document.createElement('span');
            ticket.className = 'preset-ticket preset-ticket-updated';
            ticket.textContent = 'UPDATED';
            nameRow.appendChild(ticket);
          }

          if (isLocked) {
            const lockIcon = document.createElement('span');
            lockIcon.textContent = '🔒';
            lockIcon.style.cssText = 'margin-right: 4px; font-size: 11px; flex-shrink: 0;';
            nameRow.insertBefore(lockIcon, nameRow.firstChild);
          }

          item.appendChild(checkbox);
          item.appendChild(nameSpan);

          // Shared credit validation — fast O(1) lookups

          const validateCredit = (aboutToCheck) => {
            if (!isLocked || !aboutToCheck) return true;
            const currentState = loadUnlockState();
            const availableCredits = currentState.credits || 0;
            if (availableCredits === 0) {
              showImportMessage(`🔒 "${preset.name}" is locked. Earn credits by taking pictures with newly imported presets.`);
              return false;
            }
            if (getLockedCheckedCount() >= availableCredits) {
              showImportMessage(`You only have ${availableCredits} credit${availableCredits !== 1 ? 's' : ''}.`);
              return false;
            }
            return true;
          };

          checkbox.onclick = (e) => {
            e.stopPropagation();
            if (!validateCredit(checkbox.checked)) {
              checkbox.checked = false;
              this.checkboxStates.set(preset.name, false);
              return;
            }
            this.checkboxStates.set(preset.name, checkbox.checked);
          };

          item.onclick = (e) => {
            if (e.target === checkbox) return;
            const newChecked = !checkbox.checked;
            if (!validateCredit(newChecked)) return;
            checkbox.checked = newChecked;
            this.checkboxStates.set(preset.name, newChecked);
            if (newChecked) this.speakMessage(preset.message);
          };

          fragment.appendChild(item);
        });

        // Single DOM write — replaces innerHTML = '' + 800x appendChild
        presetsList.innerHTML = '';
        presetsList.appendChild(fragment);

        updateImportSelection();
      };

      const updateImportSelection = () => {
        const items = presetsList.querySelectorAll('.menu-item');
        items.forEach(item => item.classList.remove('menu-selected'));

        if (this.currentImportScrollIndex >= 0 && this.currentImportScrollIndex < items.length) {
          const currentItem = items[this.currentImportScrollIndex];
          currentItem.classList.add('menu-selected');
          currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };

      presetsSection.appendChild(presetsList);

      // Sticky footer with optimized height and no emojis
      const footerSection = document.createElement('div');
footerSection.style.cssText = `
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  z-index: 20;
  padding: 2px;
  border-top: 1px solid #333;
  display: flex;
  gap: 3px;
`;

footerSection.innerHTML = `
  <button id="select-all-presets" style="flex: 1; padding: 0; background: #444; color: white; border: none; border-radius: 2px; font-size: 10px; cursor: pointer; height: 16px !important; min-height: 0 !important; line-height: 16px; box-sizing: border-box !important;">
    ✓ All
  </button>
  <button id="deselect-all-presets" style="flex: 1; padding: 0; background: #444; color: white; border: none; border-radius: 2px; font-size: 10px; cursor: pointer; height: 16px !important; min-height: 0 !important; line-height: 16px; box-sizing: border-box !important;">
    ✗ None
  </button>
  <button id="confirm-import-presets" style="flex: 1; padding: 0; background: #4CAF50; color: white; border: none; border-radius: 2px; font-size: 10px; font-weight: bold; cursor: pointer; height: 16px !important; min-height: 0 !important; line-height: 16px; box-sizing: border-box !important;">
    Import
  </button>
  <button id="cancel-import-presets" style="flex: 1; padding: 0; background: #666; color: white; border: none; border-radius: 2px; font-size: 10px; cursor: pointer; height: 16px !important; min-height: 0 !important; line-height: 16px; box-sizing: border-box !important;">
    Cancel
  </button>
`;

      scrollContainer.appendChild(filterSection);
      scrollContainer.appendChild(presetsSection);

      content.appendChild(header);
      content.appendChild(scrollContainer);
      modal.appendChild(content);
      modal.appendChild(footerSection);
      document.body.appendChild(modal);

      renderPresetsList();
      // Hide the loading spinner now that the list is fully rendered and visible
      if (window._hideLoadingOverlay) window._hideLoadingOverlay();

      // Event listeners
      const importFilterBlurBtn = document.getElementById('import-filter-blur-btn');
      if (importFilterBlurBtn) {
        let importBlurClickCount = 0;
        let importBlurClickTimer = null;
        importFilterBlurBtn.addEventListener('click', () => {
          importBlurClickCount++;
          if (importBlurClickCount === 1) {
            filterInput.blur();
            importBlurClickTimer = setTimeout(() => { importBlurClickCount = 0; }, 1000);
          } else {
            clearTimeout(importBlurClickTimer);
            importBlurClickCount = 0;
            filterInput.value = '';
            this.importFilterText = '';
            this.currentImportScrollIndex = 0;
            renderPresetsList();
          }
        });
      }

      const filterInput = document.getElementById('import-preset-filter');
      let importFilterDebounce = null;
      filterInput.addEventListener('input', (e) => {
        this.importFilterText = e.target.value;
        this.currentImportScrollIndex = 0;
        if (importFilterDebounce) clearTimeout(importFilterDebounce);
        importFilterDebounce = setTimeout(() => {
          renderPresetsList();
        }, 150);
      });

      document.getElementById('import-mute-toggle').onclick = () => {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
          this.stopSpeaking();
        }
        document.getElementById('import-mute-toggle').textContent = this.isMuted ? '🔇' : '🔊';
      };

      // Visual feedback helper — flashes a button briefly when tapped
      const flashBtn = (id, flashColor) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const original = btn.style.background;
        btn.style.transition = 'background 0.1s';
        btn.style.background = flashColor;
        setTimeout(() => {
          btn.style.background = original;
          btn.style.transition = '';
        }, 180);
      };

      document.getElementById('select-all-presets').onclick = () => {
        flashBtn('select-all-presets', '#aaa');
        // Count locked presets among the current filtered list
        const filteredForCheck = this.getFilteredPresets(availablePresets);
        let lockedCount = 0;
        filteredForCheck.forEach(preset => {
          const isAlreadyImported = this.importedPresets.some(p => p.name === preset.name);
          const isLocked = !isAlreadyImported && !unlockedNames.has(preset.name);
          if (isLocked) lockedCount++;
        });
        const currentCredits = loadUnlockState().credits || 0;
        // Decide now — before the spinner — whether locked presets can be included
        const canSelectLocked = lockedCount > 0 && currentCredits >= lockedCount;
        if (lockedCount > 0 && !canSelectLocked) {
          showImportMessage(
            `${lockedCount} locked preset${lockedCount !== 1 ? 's' : ''} skipped — you have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} (need ${lockedCount}). Select locked presets individually to use your credits.`
          );
        }
        const spinnerLabel = canSelectLocked ? 'Selecting all presets...' : 'Selecting all unlocked presets...';
        // Show inline spinner while the list re-renders
        presetsList.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:30px;gap:12px;"><div class="mk-loading-spinner-sm" style="width:28px;height:28px;min-width:28px;min-height:28px;aspect-ratio:1/1;flex-shrink:0;"></div><span style="color:#aaa;font-size:13px;">${spinnerLabel}</span></div>`;
        setTimeout(() => {
          const filteredPresets = this.getFilteredPresets(availablePresets);
          filteredPresets.forEach(preset => {
            const isAlreadyImported = this.importedPresets.some(p => p.name === preset.name);
            const isLocked = !isAlreadyImported && !unlockedNames.has(preset.name);
            // Select everything if credits cover all locked presets, otherwise skip locked ones
            if (!isLocked || canSelectLocked) {
              this.checkboxStates.set(preset.name, true);
            }
          });
          renderPresetsList();
        }, 20);
      };

      document.getElementById('deselect-all-presets').onclick = () => {
        flashBtn('deselect-all-presets', '#aaa');
        // Show inline spinner while the list re-renders
        presetsList.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:30px;gap:12px;"><div class="mk-loading-spinner-sm" style="width:28px;height:28px;min-width:28px;min-height:28px;aspect-ratio:1/1;flex-shrink:0;"></div><span style="color:#aaa;font-size:13px;">Deselecting all...</span></div>';
        setTimeout(() => {
          const filteredPresets = this.getFilteredPresets(availablePresets);
          filteredPresets.forEach(preset => {
            this.checkboxStates.set(preset.name, false);
          });
          renderPresetsList();
        }, 20);
      };

      const closeModal = () => {
        this.isImportModalOpen = false;
        this.stopSpeaking();
        document.body.removeChild(modal);
      };

      document.getElementById('close-import-modal').onclick = () => {
        closeModal();
        resolve(null);
      };

      document.getElementById('cancel-import-presets').onclick = () => {
        flashBtn('cancel-import-presets', '#999');
        setTimeout(() => {
          closeModal();
          resolve(null);
        }, 200);
      };

      document.getElementById('confirm-import-presets').onclick = () => {
        flashBtn('confirm-import-presets', '#80e880');
        const checkedPresets = availablePresets.filter(preset =>
          this.checkboxStates.get(preset.name) === true
        );

        // Spend 1 credit for each checked locked preset, then include it in the import
        checkedPresets.forEach(preset => {
          const isAlreadyImported = this.importedPresets.some(p => p.name === preset.name);
          const isLocked = !isAlreadyImported && !unlockedNames.has(preset.name);
          if (isLocked) {
            unlockPresetWithCredit(preset.name);
            // Also add to unlockedNames so the rest of the session knows
            unlockedNames.add(preset.name);
          }
        });

        // Update credits display after spending
        const finalCredits = loadUnlockState().credits || 0;
        const creditsEl = document.getElementById('import-credits-display');
        if (creditsEl) creditsEl.textContent = `Credits: ${finalCredits}`;

        setTimeout(() => {
          closeModal();
          resolve(checkedPresets);
        }, 200);
      };

      let importUpTapTimer = null;
      document.getElementById('import-jump-to-top').onclick = () => {
        if (importUpTapTimer) {
          // Double-tap: jump to very top
          clearTimeout(importUpTapTimer);
          importUpTapTimer = null;
          scrollContainer.scrollTop = 0;
          this.currentImportScrollIndex = 0;
          updateImportSelection();
        } else {
          importUpTapTimer = setTimeout(() => {
            importUpTapTimer = null;
            // Single-tap: page up
            scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - scrollContainer.clientHeight);
          }, 300);
        }
      };

      let importDownTapTimer = null;
      document.getElementById('import-jump-to-bottom').onclick = () => {
        if (importDownTapTimer) {
          // Double-tap: jump to very bottom
          clearTimeout(importDownTapTimer);
          importDownTapTimer = null;
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          const items = presetsList.querySelectorAll('.menu-item');
          this.currentImportScrollIndex = items.length - 1;
          updateImportSelection();
        } else {
          importDownTapTimer = setTimeout(() => {
            importDownTapTimer = null;
            // Single-tap: page down
            scrollContainer.scrollTop = Math.min(
              scrollContainer.scrollHeight - scrollContainer.clientHeight,
              scrollContainer.scrollTop + scrollContainer.clientHeight
            );
          }, 300);
        }
      };

      this.scrollImportUp = () => {
        const items = presetsList.querySelectorAll('.menu-item');
        if (items.length === 0) return;
        this.currentImportScrollIndex = Math.max(0, this.currentImportScrollIndex - 1);
        updateImportSelection();
      };

      this.scrollImportDown = () => {
        const items = presetsList.querySelectorAll('.menu-item');
        if (items.length === 0) return;
        this.currentImportScrollIndex = Math.min(items.length - 1, this.currentImportScrollIndex + 1);
        updateImportSelection();
      };

      scrollContainer.style.overflowY = 'auto';
    });
  }

  async import() {
    try {
      const availablePresets = await this.loadPresetsFromFile();
      
      if (availablePresets.length === 0) {
        return { success: false, message: 'No presets found in presets.json' };
      }

      const selectedPresets = await this.showPresetSelectionUI(availablePresets);
      
      if (selectedPresets === null) {
        return { success: false, message: 'cancelled' };
      }

      if (selectedPresets.length === 0) {
        return { success: false, message: 'No presets selected' };
      }

      // NEW LOGIC: Replace existing presets with same name (updates), add new ones
      const existingMap = new Map(this.importedPresets.map(p => [p.name, p]));
      let updatedCount = 0;
      let newCount = 0;
      
      selectedPresets.forEach(preset => {
        if (existingMap.has(preset.name)) {
          // Update existing preset
          existingMap.set(preset.name, preset);
          updatedCount++;
        } else {
          // Add new preset
          existingMap.set(preset.name, preset);
          newCount++;
        }
      });
      
      const allImported = Array.from(existingMap.values());
      
      await this.saveImportedPresets(allImported);

      let message = '';
      if (updatedCount > 0 && newCount > 0) {
        message = `Updated ${updatedCount}, imported ${newCount} new. Total: ${allImported.length}`;
      } else if (updatedCount > 0) {
        message = `Updated ${updatedCount} preset(s). Total: ${allImported.length}`;
      } else {
        message = `Imported ${newCount} new preset(s). Total: ${allImported.length}`;
      }

      return { 
        success: true, 
        message: message,
        updated: updatedCount,
        new: newCount,
        total: allImported.length
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async deletePreset(presetName) {
    const index = this.importedPresets.findIndex(p => p.name === presetName);
    if (index >= 0) {
      this.importedPresets.splice(index, 1);
      await this.saveImportedPresets(this.importedPresets);
      return true;
    }
    return false;
  }

  async clearImportedPresets() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([IMPORT_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(IMPORT_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.importedPresets = [];
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  getImportedPresets() {
    return this.importedPresets;
  }
}

export const presetImporter = new PresetImporter();