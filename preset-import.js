// preset-import.js - Handle external preset importing

const IMPORT_DB_NAME = 'ImportedPresetsDB';
const IMPORT_DB_VERSION = 2;
const IMPORT_STORE_NAME = 'imported_presets';

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
    try {
      const response = await fetch('./presets.json');
      if (!response.ok) {
        throw new Error('Failed to load presets.json');
      }
      
      const presets = await response.json();
      
      const validPresets = presets.filter(p => 
        p.name && p.message && Array.isArray(p.category)
      );

      // Alphabetize presets by name
      return validPresets.sort((a, b) => a.name.localeCompare(b.name));
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

    newPresets.sort((a, b) => a.name.localeCompare(b.name));
    updatedPresets.sort((a, b) => a.name.localeCompare(b.name));
    normalPresets.sort((a, b) => a.name.localeCompare(b.name));

    this._sortedPresets = [...newPresets, ...updatedPresets, ...normalPresets];

    // Pre-build lowercase search strings once — reused on every keypress
    this._searchIndex = this._sortedPresets.map(preset => {
      const name = preset.name.toLowerCase();
      const message = (preset.message || '').toLowerCase();
      const cats = Array.isArray(preset.category) ? preset.category.join(' ').toLowerCase() : '';
      return name + ' ' + message + ' ' + cats;
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
      header.innerHTML = `
        <h2 style="font-size: 14px;">Import (<span id="import-preset-count">${availablePresets.length}</span>)</h2>
        <div class="menu-nav-buttons">
          <button id="import-mute-toggle" class="menu-jump-button" title="Mute/Unmute">🔊</button>          
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
        <input type="text" id="import-preset-filter" class="style-filter" placeholder="Filter..." style="width: 100%; margin: 0; height: 24px; font-size: 12px;">
      `;

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
        if (countElement) {
          countElement.textContent = filteredPresets.length;
        }

        presetsList.innerHTML = '';
        
        filteredPresets.forEach((preset, index) => {
          const item = document.createElement('button');
          item.className = 'menu-item';
          item.dataset.presetIndex = index;
          item.dataset.presetName = preset.name;
          // Added margin-bottom: 2px for small space between presets
          item.style.cssText = 'display: flex; align-items: flex-start; padding: 6px 15px; width: 100%; justify-content: flex-start; margin-bottom: 2px;';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `import-preset-${index}`;
          checkbox.checked = this.checkboxStates.get(preset.name) || false;
          checkbox.style.cssText = `
            width: 18px;
            height: 18px;
            min-width: 18px;
            min-height: 18px;
            margin-right: 10px;
            cursor: pointer;
            accent-color: #4CAF50;
            flex-shrink: 0;
          `;
          checkbox.onclick = (e) => {
            e.stopPropagation();
            this.checkboxStates.set(preset.name, checkbox.checked);
          };

          const firstLine = (preset.message || '').split('\n')[0].trim();

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

          // Check if preset is NEW or UPDATED
          const existingPreset = this.importedPresets.find(p => p.name === preset.name);
          
          if (!existingPreset) {
            // This is a NEW preset - show RED ticket
            const ticket = document.createElement('span');
            ticket.className = 'preset-ticket preset-ticket-new';
            ticket.textContent = 'NEW';
            nameRow.appendChild(ticket);
          } else if (existingPreset.message !== preset.message) {
            // This preset has been UPDATED - show GREEN ticket with pulse
            const ticket = document.createElement('span');
            ticket.className = 'preset-ticket preset-ticket-updated';
            ticket.textContent = 'UPDATED';
            nameRow.appendChild(ticket);
          }

          item.appendChild(checkbox);
          item.appendChild(nameSpan);

          item.onclick = (e) => {
            if (e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
              this.checkboxStates.set(preset.name, checkbox.checked);
            }
            // Only speak when checking ON, not when unchecking
            if (checkbox.checked) {
              this.speakMessage(preset.message);
            }
          };

          presetsList.appendChild(item);
        });

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

      // Event listeners
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

      document.getElementById('select-all-presets').onclick = () => {
        const filteredPresets = this.getFilteredPresets(availablePresets);
        filteredPresets.forEach(preset => {
          this.checkboxStates.set(preset.name, true);
        });
        renderPresetsList();
      };

      document.getElementById('deselect-all-presets').onclick = () => {
        const filteredPresets = this.getFilteredPresets(availablePresets);
        filteredPresets.forEach(preset => {
          this.checkboxStates.set(preset.name, false);
        });
        renderPresetsList();
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
        closeModal();
        resolve(null);
      };

      document.getElementById('confirm-import-presets').onclick = () => {
        const selected = availablePresets.filter(preset => 
          this.checkboxStates.get(preset.name) === true
        );
        
        closeModal();
        resolve(selected);
      };

      document.getElementById('import-jump-to-top').onclick = () => {
        scrollContainer.scrollTop = 0;
        this.currentImportScrollIndex = 0;
        updateImportSelection();
      };

      document.getElementById('import-jump-to-bottom').onclick = () => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        const items = presetsList.querySelectorAll('.menu-item');
        this.currentImportScrollIndex = items.length - 1;
        updateImportSelection();
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