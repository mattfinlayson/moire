import { presetStorage } from './storage.js';
import { presetImporter, earnCredit, unlockAllPresets, getCredits } from './preset-import.js';

// Loading overlay helpers 

function showLoadingOverlay(label) {
  let overlay = document.getElementById('mk-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mk-loading-overlay';
    overlay.className = 'mk-loading-overlay';
    overlay.innerHTML = '<div class="mk-loading-spinner"></div><div class="mk-loading-label" id="mk-loading-label"></div>';
    document.body.appendChild(overlay);
  }
  const labelEl = document.getElementById('mk-loading-label');
  if (labelEl) labelEl.textContent = label || 'Loading...';
  overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('mk-loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Expose so preset-import.js can call hideLoadingOverlay when the import modal opens

window._hideLoadingOverlay = hideLoadingOverlay;


// No need for DEFAULT_PRESETS - will load from JSON when needed
let DEFAULT_PRESETS = [];
let totalFactoryPresetCount = 0;

// Camera elements
let video, canvas, capturedImage, resetButton;
let stream = null;
let videoTrack = null;

// ===== CUSTOM ALERT & CONFIRM SYSTEM =====

// Custom styled alert to replace browser alert()
function customAlert(message, type = 'info') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const buttonsEl = document.getElementById('custom-alert-buttons');
    
    // Set message
    messageEl.textContent = message;
    
    // Set up single OK button
    buttonsEl.innerHTML = '<button class="custom-alert-btn custom-alert-btn-primary" id="custom-alert-ok">OK</button>';
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle OK button
    const okBtn = document.getElementById('custom-alert-ok');
    const handleOk = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      resolve();
    };
    okBtn.addEventListener('click', handleOk);
  });
}

// Custom styled confirm to replace browser confirm()
function customConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const buttonsEl = document.getElementById('custom-alert-buttons');
    
    // Set message
    messageEl.textContent = message;
    
    // Set up Yes/No buttons
    const yesText = options.yesText || 'Yes';
    const noText = options.noText || 'No';
    const danger = options.danger ? 'custom-alert-btn-danger' : 'custom-alert-btn-primary';
    
    buttonsEl.innerHTML = `
      <button class="custom-alert-btn custom-alert-btn-secondary" id="custom-confirm-no">${noText}</button>
      <button class="custom-alert-btn ${danger}" id="custom-confirm-yes">${yesText}</button>
    `;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle buttons
    const yesBtn = document.getElementById('custom-confirm-yes');
    const noBtn = document.getElementById('custom-confirm-no');
    
    const handleYes = () => {
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      resolve(true);
    };
    
    const handleNo = () => {
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      resolve(false);
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
  });
}

// Override native alert and confirm (optional - for easier migration)
window.alert = customAlert;
window.confirm = customConfirm;

// Resolution settings
const RESOLUTION_PRESETS = [
  { name: 'Magic Gallery (640x480)', width: 640, height: 480 }
];
let currentResolutionIndex = 0;

// Import resolution settings
const IMPORT_RESOLUTION_OPTIONS = [
  { name: 'Magic Gallery (640x480)', width: 640, height: 480 }
];
let currentImportResolutionIndex = 0;

// White balance settings - COMMENTED OUT
// const WHITE_BALANCE_MODES = [
//   { name: 'Auto', value: 'auto' },
//   { name: 'Daylight', value: 'daylight' },
//   { name: 'Cloudy', value: 'cloudy' },
//   { name: 'Tungsten', value: 'tungsten' },
//   { name: 'Fluorescent', value: 'fluorescent' },
//   { name: 'Candlelight', value: 'candlelight' },
//   { name: 'Moonlight', value: 'moonlight' }
// ];
// let currentWhiteBalanceIndex = 0; // Default to Auto
// const WHITE_BALANCE_STORAGE_KEY = 'r1_camera_white_balance';

// Camera switching variables
let currentCameraIndex = 0;
let availableCameras = [];
let isLoadingCamera = false;

// Zoom variables
let currentZoom = 1;
let isPinching = false;
let initialPinchDistance = 0;
let initialZoom = 1;
let zoomThrottleTimeout = null;

const LAST_USED_PRESET_KEY = 'r1_camera_last_preset';

// Removed settings are pinned off so stale localStorage cannot affect captures.
let masterPromptText = '';
let masterPromptEnabled = false;
let selectedAspectRatio = 'none';

// Random seed selection tracking
const SELECTION_HISTORY_KEY = 'r1_camera_selection_history';
let selectionHistory = {}; // Format: { presetName: [selection1, selection2, ...] }
const MAX_HISTORY_PER_PRESET = 5; // Remember last 5 selections per preset

// Randomizer variables
let isRandomMode = false;

let noMagicMode = false;
let lastWheelCameraSwitchAt = 0;
const PHOTO_PREVIEW_RETURN_DELAY_MS = 5000;
let photoPreviewReturnTimer = null;
const APP_VERSION = (() => {
  const d = new Date(document.lastModified);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return 'v' + mm + '.' + dd + '.' + yyyy + '.' + hh + '.' + min;
})();
let manuallySelectedOption = null;

// Track if we entered Master Prompt from gallery
let returnToGalleryFromMasterPrompt = false;
let savedViewerImageIndex = -1;

// Track if we opened an editor from the gallery viewer prompt tap
let returnToGalleryFromViewerEdit = false;
let returnToMainMenuFromBuilder = false;
let isPresetInfoModalOpen = false;

// Style reveal elements
let styleRevealElement, styleRevealText;
let styleRevealTimeout = null;
let filterDebounceTimeout = null;

// Menu scrolling variables
let currentMenuIndex = 0;
let isMenuOpen = false;
let menuScrollEnabled = false;
let isTutorialOpen = false;
let tutorialScrollEnabled = false;
let isPresetSelectorOpen = false;
let currentPresetIndex_Gallery = 0;
let currentSettingsIndex = 0;
let currentResolutionIndex_Menu = 0;
let currentMasterPromptIndex = 0;
let currentMotionIndex = 0;
let isSettingsSubmenuOpen = false;
let isResolutionSubmenuOpen = false;
let isMasterPromptSubmenuOpen = false;
let isAspectRatioSubmenuOpen = false;
let currentAspectRatioIndex = 0;
let isImportResolutionSubmenuOpen = false;
let currentImportResolutionIndex_Menu = 0;
let isTutorialSubmenuOpen = false;
let isPresetBuilderSubmenuOpen = false;
let editingPresetBuilderIndex = -1;
let singleOptionCounter = 0;
let optionGroupCounter = 0;
let currentGalleryIndex = 0;
let currentViewerIndex = 0;
let currentEditorIndex = 0;
let currentQueueIndex = 0;
let currentTutorialGlossaryIndex = 0;

// Gallery variables - IndexedDB
const DB_NAME = 'R1CameraGallery';
const DB_VERSION = 1;
const STORE_NAME = 'images';
let db = null;
let galleryImages = [];
const GALLERY_SORT_ORDER_KEY = 'r1_gallery_sort_order';
let currentViewerImageIndex = -1;
let viewerZoom = 1;
let viewerIsPinching = false;
let viewerInitialPinchDistance = 0;
let viewerInitialZoom = 1;
let currentGalleryPage = 1;
const ITEMS_PER_PAGE = 16;
let galleryStartDate = null;
let galleryEndDate = null;
let gallerySortOrder = 'newest';

// Batch processing variables
let isBatchMode = false;
let selectedBatchImages = new Set();

// GALLERY FOLDERS

const FOLDERS_STORAGE_KEY = 'r1_gallery_folders';
let galleryFolders = []; // [{ id, name, createdAt }]
let currentFolderView = null; // null = root gallery, string = folderId
// END GALLERY FOLDERS

// Multiple preset variables
let isMultiPresetMode = false;
let isBatchPresetSelectionActive = false;
let selectedPresets = [];
let multiPresetImageId = null;

// Camera multi-preset variables

let isCameraMultiPresetActive = false;
let cameraSelectedPresets = []; // The presets selected for next capture
const CAMERA_MULTI_PRESET_KEY = 'r1_camera_multi_presets';

// Camera LAYER-preset variables (combines multiple presets into ONE prompt)

let isCameraLayerActive = false;
let cameraLayerPresets = []; // [primaryPreset, layer1, layer2, ...]
const CAMERA_LAYER_PRESET_KEY = 'r1_camera_layer_presets';

// Gallery LAYER-preset variables (persists while viewer is open)

let isGalleryLayerActive = false;
let galleryLayerPresets = []; // saved layer selections for the gallery viewer

// Shared flag so selectPreset() knows we are picking layers

let isLayerPresetMode = false;
let layerSelectedPresets = []; // Temp array while user is choosing
let galleryLayerImageId = null; // Set when opening Layer from the gallery viewer

// Style filter

let presetListScrollPosition = 0;

// QR Code detection variables

let qrDetectionInterval = null;
let lastDetectedQR = null;
let qrDetectionActive = false;
const QR_DETECTION_INTERVAL = 500; // Check every 500ms

// Preset Builder templates
const PRESET_TEMPLATES = {
  transform: "Take a picture and transform the image into [DESCRIBE TRANSFORMATION]. [ADD SPECIFIC DETAILS ABOUT STYLE, APPEARANCE, COLORS, ETC.]",
  transform_subject: "Take a picture and transform the subject into [WHAT THE SUBJECT BECOMES]. Preserve the subject's recognizable facial structure and identity. [ADD DETAILS ABOUT NEW APPEARANCE, ENVIRONMENT, LIGHTING].",
  convert: "Take a picture and convert the scene into [DESCRIBE NEW FORMAT/MEDIUM]. [ADD DETAILS ABOUT MATERIALS, TEXTURES, SCALE].",
  style: "Take a picture in the style of [ARTISTIC STYLE/ARTIST]. [ADD DETAILS ABOUT TECHNIQUE, COLORS, COMPOSITION].",
  place: "Take a picture and place the subject in [DESCRIBE SCENE/LOCATION]. [ADD DETAILS ABOUT LIGHTING, ATMOSPHERE, INTEGRATION].",
  recreate: "Take a picture and recreate [FAMOUS WORK/SCENE]. Replace [DESCRIBE WHAT TO REPLACE]. Preserve the iconic [DESCRIBE KEY ELEMENTS TO KEEP].",
  render: "Take a picture and render it as [FORMAT/MEDIUM]. [ADD DETAILS ABOUT APPEARANCE, TEXTURE, TECHNICAL SPECIFICS].",
  make: "Take a picture and make the subject into [CHARACTER/CREATURE]. [ADD DETAILS ABOUT APPEARANCE, TRAITS, SETTING]. Make it photorealistic.",
  analyze: "Analyze the image and [DESCRIBE WHAT TO ANALYZE/EXTRACT]. [ADD DETAILS ABOUT OUTPUT FORMAT] and email it to me.",
  
  // Random Selection Templates
  random_even_odd: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If the RANDOM SEED ends in an EVEN number (0,2,4,6,8): SELECT Option A
- If the RANDOM SEED ends in an ODD number (1,3,5,7,9): SELECT Option B

If Option A:
[DESCRIBE WHAT HAPPENS IN OPTION A - BE SPECIFIC ABOUT VISUAL DETAILS, STYLE, SETTING, ETC.]

If Option B:
[DESCRIBE WHAT HAPPENS IN OPTION B - BE SPECIFIC ABOUT VISUAL DETAILS, STYLE, SETTING, ETC.]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO BOTH OPTIONS - LIGHTING, QUALITY, PRESERVATION, ETC.]`,

  random_last_digit: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST DIGIT modulo [NUMBER 2-10]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  - 5: [OPTION 6 DESCRIPTION]
  - 6: [OPTION 7 DESCRIPTION]
  - 7: [OPTION 8 DESCRIPTION]
  - 8: [OPTION 9 DESCRIPTION]
  - 9: [OPTION 10 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS - STYLE, QUALITY, TECHNICAL DETAILS, ETC.]

IMPORTANT:
- Replace [NUMBER 2-10] with the actual number of options you have (between 2 and 10)
- Remove any unused option lines (e.g., if you only have 5 options, remove lines 5-9)
- Each option should be a distinct visual variation or transformation
- For exactly 10 options, use LAST DIGIT modulo 10 (covers digits 0-9)`,

  random_last_two: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST TWO DIGITS modulo [NUMBER 11-99]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  - 5: [OPTION 6 DESCRIPTION]
  - 6: [OPTION 7 DESCRIPTION]
  - 7: [OPTION 8 DESCRIPTION]
  - 8: [OPTION 9 DESCRIPTION]
  - 9: [OPTION 10 DESCRIPTION]
  - 10: [OPTION 11 DESCRIPTION]
  - 11: [OPTION 12 DESCRIPTION]
  - 12: [OPTION 13 DESCRIPTION]
  - 13: [OPTION 14 DESCRIPTION]
  - 14: [OPTION 15 DESCRIPTION]
  - 15: [OPTION 16 DESCRIPTION]
  - 16: [OPTION 17 DESCRIPTION]
  - 17: [OPTION 18 DESCRIPTION]
  - 18: [OPTION 19 DESCRIPTION]
  - 19: [OPTION 20 DESCRIPTION]
  - 20: [OPTION 21 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS]

IMPORTANT:
- Replace [NUMBER 11-99] with the actual number of options (between 11 and 99)
- Add or remove option lines to match your number of options
- Use LAST TWO DIGITS only when you have MORE than 10 options
- Ensure the colon (:) comes immediately after the modulo number
- Use exactly 2 spaces before each dash (-)
- Keep all options in one continuous list with no blank lines`,

  random_last_three: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST THREE DIGITS modulo [NUMBER 100+]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  (continue numbering for all your options)
  - 98: [OPTION 99 DESCRIPTION]
  - 99: [OPTION 100 DESCRIPTION]
  - 100: [OPTION 101 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS]

IMPORTANT:
- Replace [NUMBER 100+] with the actual number of options (101 or more)
- Add option lines for every option you want to include
- Use LAST THREE DIGITS only when you have 101 or more options
- Ensure the colon (:) comes immediately after the modulo number
- Use exactly 2 spaces before each dash (-)
- Keep all options in one continuous list with no blank lines
- This format is ideal for large preset collections like 120 Star Trek species or 150 character types`,
  
  custom: ""
};

// Load styles from localStorage or use defaults
let CAMERA_PRESETS = [];
let factoryPresets = [];
let hasImportedPresets = false; // Track if we're using imported presets
let currentPresetIndex = 0;
let editingStyleIndex = -1;
let isOnline = navigator.onLine;
let photoQueue = [];
let isSyncing = false;

// Scroll debouncing variables
const SCROLL_DEBOUNCE_MS = 500;
const QUEUE_STORAGE_KEY = 'r1_camera_queue';

// Connection status elements
let connectionStatusElement, queueStatusElement, syncButton;

// Local storage key (for ALL camera presets)
const STORAGE_KEY = 'r1_camera_styles';

// Local storage key (for the ARRAY of favorite style names)
let favoriteStyles = []; 
const FAVORITE_STYLES_KEY = 'r1_camera_favorites';
const VISIBLE_PRESETS_KEY = 'r1_camera_visible_presets';
let visiblePresets = []; // Array of preset names that should be shown
let isVisiblePresetsSubmenuOpen = false;
let currentVisiblePresetsIndex = 0;
let visiblePresetsScrollEnabled = true;

// Picker state
let selectedPickerPreset = null;

function getPickerSelectedPreset() {
  if (selectedPickerPreset && CAMERA_PRESETS.includes(selectedPickerPreset)) {
    return selectedPickerPreset;
  }

  const primary = document.getElementById('picker-primary');
  if (primary && primary._preset && CAMERA_PRESETS.includes(primary._preset)) {
    selectedPickerPreset = primary._preset;
    return selectedPickerPreset;
  }

  return null;
}

function generatePickerOptions() {
  const sortedPresets = getSortedPresets();

  if (sortedPresets.length === 0) {
    return { primary: null, alts: [] };
  }

  // Fisher-Yates shuffle on a copy of indices
  const indices = Array.from({ length: sortedPresets.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Take up to 3 unique; cycle if fewer than 3 visible
  const picks = [];
  for (let i = 0; i < 3; i++) {
    picks.push(sortedPresets[indices[i % indices.length]]);
  }

  return { primary: picks[0], alts: picks.slice(1, 3) };
}

function renderPicker() {
  const overlay = document.getElementById('picker-overlay');
  const primaryEl = document.getElementById('picker-primary');
  const altEls = document.querySelectorAll('.picker-alt');
  if (!overlay || !primaryEl) return;

  const options = generatePickerOptions();
  if (!options.primary) {
    // Empty state
    primaryEl.querySelector('.picker-name').textContent = '';
    altEls.forEach(el => { el.querySelector('.picker-name').textContent = ''; });
    return;
  }

  // Primary
  primaryEl.querySelector('.picker-name').textContent = options.primary.name;
  primaryEl._preset = options.primary;
  primaryEl.classList.add('selected');

  // Alts
  altEls.forEach((el, i) => {
    if (options.alts[i]) {
      el.querySelector('.picker-name').textContent = options.alts[i].name;
      el._preset = options.alts[i];
      el.style.display = 'flex';
    } else {
      el.querySelector('.picker-name').textContent = '';
      el._preset = null;
    }
  });

  // Clear alt selection
  altEls.forEach(el => el.classList.remove('selected'));

  // Default selection = primary
  selectedPickerPreset = options.primary;
}

function handleWheelCameraSwitch() {
  if (!stream || availableCameras.length <= 1 || isLoadingCamera) return false;

  const now = Date.now();
  if (now - lastWheelCameraSwitchAt < 600) return true;

  lastWheelCameraSwitchAt = now;
  switchCamera();
  return true;
}

function clearPhotoPreviewReturnTimer() {
  if (photoPreviewReturnTimer) {
    clearTimeout(photoPreviewReturnTimer);
    photoPreviewReturnTimer = null;
  }
}

function schedulePhotoPreviewReturn() {
  clearPhotoPreviewReturnTimer();
  photoPreviewReturnTimer = setTimeout(() => {
    photoPreviewReturnTimer = null;
    if (capturedImage?.style.display === 'block' && video?.style.display === 'none') {
      resetToCamera();
    }
  }, PHOTO_PREVIEW_RETURN_DELAY_MS);
}

(function setupPickerHandlers() {
  const primary = document.getElementById('picker-primary');
  const altEls = document.querySelectorAll('.picker-alt');
  if (!primary) return;

  function selectTile(tile, preset) {
    // Deselect all
    primary.classList.remove('selected');
    altEls.forEach(el => el.classList.remove('selected'));
    // Select tapped
    tile.classList.add('selected');
    selectedPickerPreset = preset;
  }

  primary.addEventListener('click', () => {
    if (primary._preset) selectTile(primary, primary._preset);
  });

  altEls.forEach(tile => {
    tile.addEventListener('click', () => {
      if (tile._preset) selectTile(tile, tile._preset);
    });
  });
})();

// Style reveal functionality
function showStyleReveal(styleName) {
  if (styleRevealTimeout) {
    clearTimeout(styleRevealTimeout);
    styleRevealTimeout = null;
  }

  if (!styleRevealElement) {
    styleRevealElement = document.getElementById('style-reveal');
    styleRevealText = document.getElementById('style-reveal-text');
  }

  if (!styleRevealElement || !styleRevealText) return;
  
  // If NO MAGIC MODE is on, always show NO MAGIC MODE in popup
  styleRevealText.textContent = noMagicMode ? '⚡ NO MAGIC MODE' : styleName;
  // Force the CSS animation to restart cleanly on every call
  styleRevealElement.style.display = 'none';
  // Trigger reflow so the browser registers the display change before showing again
  void styleRevealElement.offsetHeight;
  styleRevealElement.style.display = 'block';
  
  styleRevealTimeout = setTimeout(() => {
    if (styleRevealElement) {
      styleRevealElement.style.display = 'none';
    }
    styleRevealTimeout = null;
  }, 1800);
}

// ===================================
// Gallery Functions
// ===================================

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB opened successfully');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Object store created');
      }
    };
  });
}

// Migrate old localStorage data to IndexedDB (run once)
async function migrateFromLocalStorage() {
  try {
    const oldIndexJson = localStorage.getItem('r1_gallery_index');
    if (!oldIndexJson) {
      console.log('No old gallery data to migrate');
      return;
    }
    
    const index = JSON.parse(oldIndexJson);
    let migratedCount = 0;
    
    for (const keyNum of index) {
      const keyName = 'r1_gallery_' + keyNum;
      const imagesJson = localStorage.getItem(keyName);
      if (imagesJson) {
        const images = JSON.parse(imagesJson);
        for (const image of images) {
          await saveImageToDB(image);
          migratedCount++;
        }
        // Clean up old localStorage key
        localStorage.removeItem(keyName);
      }
    }
    
    // Clean up old index
    localStorage.removeItem('r1_gallery_index');
    
    console.log(`Migration complete: ${migratedCount} images migrated to IndexedDB`);
    
    // Reload gallery
    await loadGallery();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

// Load gallery from IndexedDB
async function loadGallery() {
  try {
    if (!db) {
      await initDB();
    }
    
    galleryImages = [];
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        galleryImages = request.result || [];
        
        // Load saved sort order
        const savedSortOrder = localStorage.getItem(GALLERY_SORT_ORDER_KEY);
        if (savedSortOrder) {
          gallerySortOrder = savedSortOrder;
        }
        
        // Sort by timestamp descending
        galleryImages.sort((a, b) => b.timestamp - a.timestamp);
        
        console.log(`Gallery loaded: ${galleryImages.length} images`);
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to load gallery:', request.error);
        galleryImages = [];
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error loading gallery:', err);
    galleryImages = [];
  }
}

// Save single image to IndexedDB
async function saveImageToDB(imageItem) {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put(imageItem);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Image saved to IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to save image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error saving image:', err);
    throw err;
  }
}

// Delete image from IndexedDB
async function deleteImageFromDB(imageId) {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(imageId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Image deleted from IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to delete image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error deleting image:', err);
  }
}

// Get image count from IndexedDB
async function getImageCount() {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.count();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Failed to count images:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error counting images:', err);
    return 0;
  }
}

async function addToGallery(imageBase64) {
  const galleryItem = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    imageBase64: imageBase64,
    timestamp: Date.now()
  };
  
  // Add to memory array
  galleryImages.unshift(galleryItem);
  
  // Save to IndexedDB (no limit!)
  await saveImageToDB(galleryItem);
  
  console.log(`Image added. Total: ${galleryImages.length}`);
}

function filterGalleryByDate(images) {
  if (!galleryStartDate && !galleryEndDate) {
    return images;
  }
  
  return images.filter(item => {
    const itemDate = new Date(item.timestamp);
    itemDate.setHours(0, 0, 0, 0);
    const itemTime = itemDate.getTime();
    
    let matchesStart = true;
    let matchesEnd = true;
    
    if (galleryStartDate) {
      const startTime = new Date(galleryStartDate).getTime();
      matchesStart = itemTime >= startTime;
    }
    
    if (galleryEndDate) {
      const endTime = new Date(galleryEndDate).getTime();
      matchesEnd = itemTime <= endTime;
    }
    
    return matchesStart && matchesEnd;
  });
}

function sortGalleryImages(images) {
  const sorted = [...images];
  if (gallerySortOrder === 'newest') {
    sorted.sort((a, b) => b.timestamp - a.timestamp);
  } else {
    sorted.sort((a, b) => a.timestamp - b.timestamp);
  }
  return sorted;
}

function getFilteredAndSortedGallery() {
  let filtered = filterGalleryByDate(galleryImages);
  return sortGalleryImages(filtered);
}

async function showGallery(renderOnly = false) {
  if (!renderOnly) {
    pauseCamera();
    // Clear any captured image before opening gallery
    if (capturedImage && capturedImage.style.display === 'block') {
      resetToCamera();
    }
    
    // Reload gallery from IndexedDB to ensure we have latest data
    await loadGallery();
    
    // Hide left carousel so it doesn't block gallery clicks
    const leftCamCarousel = document.getElementById('left-cam-carousel');
    if (leftCamCarousel) {
      leftCamCarousel.style.display = 'none';
    }
    // Hide picker
    const pickerOverlayEl2 = document.getElementById('picker-overlay');
    if (pickerOverlayEl2) {
      pickerOverlayEl2.style.display = 'none';
    }
  }
  const modal = document.getElementById('gallery-modal');
  const grid = document.getElementById('gallery-grid');
  const pagination = document.getElementById('gallery-pagination');
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  // Update gallery count in header
  const galleryCount = document.getElementById('gallery-count');
  if (galleryCount) {
    galleryCount.textContent = galleryImages.length;
  }
  
  // Set the sort order dropdown to current value
  const sortOrderSelect = document.getElementById('gallery-sort-order');
  if (sortOrderSelect) {
    sortOrderSelect.value = gallerySortOrder;
  }
  
  // Show or hide the folder breadcrumb bar
  let breadcrumb = document.getElementById('gallery-folder-breadcrumb');
  if (!breadcrumb) {
    breadcrumb = document.createElement('div');
    breadcrumb.id = 'gallery-folder-breadcrumb';
    breadcrumb.className = 'gallery-folder-breadcrumb';
    grid.parentNode.insertBefore(breadcrumb, grid);
  }
  if (currentFolderView !== null) {
    const folder = galleryFolders.find(f => f.id === currentFolderView);
    breadcrumb.style.display = 'flex';
    breadcrumb.innerHTML = '';
    const backBtn = document.createElement('button');
    backBtn.className = 'gallery-folder-breadcrumb-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', closeFolderView);
    const label = document.createElement('span');
    label.textContent = `📁 ${folder ? folder.name : 'Folder'}`;
    breadcrumb.appendChild(backBtn);
    breadcrumb.appendChild(label);
  } else {
    breadcrumb.style.display = 'none';
  }

  // Get images for current view (root or folder)
  const viewImages = getImagesInCurrentView();
  const filteredImages = viewImages.filter(img => {
    if (!galleryStartDate && !galleryEndDate) return true;
    const d = new Date(img.timestamp);
    d.setHours(0,0,0,0);
    const t = d.getTime();
    if (galleryStartDate && t < new Date(galleryStartDate).getTime()) return false;
    if (galleryEndDate && t > new Date(galleryEndDate).getTime()) return false;
    return true;
  });
  const sortedImages = gallerySortOrder === 'oldest'
    ? [...filteredImages].sort((a,b) => a.timestamp - b.timestamp)
    : [...filteredImages].sort((a,b) => b.timestamp - a.timestamp);

  // Build a combined list of all items for the current view.
  // At root: folders come first (as pseudo-items), then images.
  // Inside a folder: images only.
  const showFolders = currentFolderView === null && !galleryStartDate && !galleryEndDate;

  // Each entry is either { type:'folder', folder } or { type:'image', item }
  const allItems = [];
  if (showFolders) {
    galleryFolders.forEach(folder => allItems.push({ type: 'folder', folder }));
  }
  sortedImages.forEach(item => allItems.push({ type: 'image', item }));

  const fragment = document.createDocumentFragment();

  if (allItems.length === 0) {
    grid.innerHTML = currentFolderView !== null
      ? '<div class="gallery-empty">This folder is empty.</div>'
      : '<div class="gallery-empty">No photos yet.</div>';
    pagination.style.display = 'none';
  } else {
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE) || 1;
    currentGalleryPage = Math.min(currentGalleryPage, totalPages);

    const startIndex = (currentGalleryPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, allItems.length);
    const pageItems = allItems.slice(startIndex, endIndex);

    pageItems.forEach(entry => {
      if (entry.type === 'folder') {
        const folder = entry.folder;
        const folderEl = document.createElement('div');
        folderEl.className = 'gallery-item gallery-folder';
        folderEl.dataset.folderId = folder.id;

        if (isBatchMode && selectedBatchImages.has(folder.id)) {
          folderEl.classList.add('selected');
        }

        if (isBatchMode) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'gallery-item-checkbox';
          checkbox.checked = selectedBatchImages.has(folder.id);
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBatchImageSelection(folder.id);
          });
          folderEl.appendChild(checkbox);
        }

        const icon = document.createElement('div');
        icon.className = 'gallery-folder-icon';
        icon.textContent = '📁';
        folderEl.appendChild(icon);

        const nameEl = document.createElement('div');
        nameEl.className = 'gallery-folder-name';
        nameEl.textContent = folder.name;
        folderEl.appendChild(nameEl);

        // Long press to rename; tap to open (or select in batch)
        let pressTimer = null;
        folderEl.addEventListener('touchstart', () => {
          pressTimer = setTimeout(() => {
            pressTimer = null;
            if (!isBatchMode) startFolderRename(folder.id);
          }, 600);
        }, { passive: true });
        folderEl.addEventListener('touchend', () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        });
        folderEl.addEventListener('touchmove', () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        });

        folderEl.onclick = (e) => {
          if (isBatchMode) {
            if (e.target.type === 'checkbox') return;
            const rect = folderEl.getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const relY = e.clientY - rect.top;
            if (relX < rect.width * 0.4 && relY < rect.height * 0.4) {
              toggleBatchImageSelection(folder.id);
            } else {
              openFolderView(folder.id);
            }
          } else {
            openFolderView(folder.id);
          }
        };

        fragment.appendChild(folderEl);

      } else {
        // Image entry
        const item = entry.item;
        const imgContainer = document.createElement('div');
        imgContainer.className = 'gallery-item';
        imgContainer.dataset.imageId = item.id;

        if (isBatchMode && selectedBatchImages.has(item.id)) {
          imgContainer.classList.add('selected');
        }

        if (isBatchMode) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'gallery-item-checkbox';
          checkbox.checked = selectedBatchImages.has(item.id);
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBatchImageSelection(item.id);
          });
          imgContainer.appendChild(checkbox);
        }

        const img = document.createElement('img');
        img.src = item.imageBase64;
        img.alt = 'Gallery image';
        img.loading = 'lazy';
        imgContainer.appendChild(img);

        // Long press on image in batch mode = show move-to-folder modal
        let imgPressTimer = null;
        if (isBatchMode) {
          imgContainer.addEventListener('touchstart', () => {
            imgPressTimer = setTimeout(() => {
              imgPressTimer = null;
              if (!selectedBatchImages.has(item.id)) {
                toggleBatchImageSelection(item.id);
              }
              showMoveToFolderModal();
            }, 600);
          }, { passive: true });
          imgContainer.addEventListener('touchend', () => {
            if (imgPressTimer) { clearTimeout(imgPressTimer); imgPressTimer = null; }
          });
          imgContainer.addEventListener('touchmove', () => {
            if (imgPressTimer) { clearTimeout(imgPressTimer); imgPressTimer = null; }
          });
        }

        imgContainer.onclick = () => {
          if (isBatchMode) {
            toggleBatchImageSelection(item.id);
          } else {
            const originalIndex = galleryImages.findIndex(i => i.id === item.id);
            openImageViewer(originalIndex);
          }
        };

        fragment.appendChild(imgContainer);
      }
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);

    if (totalPages > 1) {
      pagination.style.display = 'flex';
      pageInfo.textContent = `Page ${currentGalleryPage} of ${totalPages}`;
      prevBtn.disabled = currentGalleryPage === 1;
      nextBtn.disabled = currentGalleryPage === totalPages;
    } else {
      pagination.style.display = 'none';
    }
  }

  modal.style.display = 'flex';
}

async function hideGallery() {
  document.getElementById('gallery-modal').style.display = 'none';
  currentGalleryPage = 1;
  
  // Restore left carousel before reinitializing camera
  const leftCamCarousel = document.getElementById('left-cam-carousel');
  if (leftCamCarousel) {
    leftCamCarousel.style.display = 'flex';
    leftCamCarousel.classList.remove('hidden');
  }

  // Restore picker
  const pickerOverlayEl = document.getElementById('picker-overlay');
  if (pickerOverlayEl) {
    renderPicker();
    pickerOverlayEl.style.display = 'flex';
  }

  await reinitializeCamera(); // Re-initialize fully so camera switch works after gallery
  
  
  // Re-show the style reveal footer
  if (noMagicMode) {
        showStyleReveal('⚡ NO MAGIC MODE');
  } else if (isRandomMode || isMultiPresetMode) {
    let modeName = '';
    if (isRandomMode) modeName = '🎲 Random Mode';
        showStyleReveal(modeName);
  } else {
    // Update both footer AND popup immediately
    notifyPresetChange();
  }
}

function nextGalleryPage() {
  // Count folders + images together, matching how showGallery paginates
  const showFolders = currentFolderView === null && !galleryStartDate && !galleryEndDate;
  const folderCount = showFolders ? galleryFolders.length : 0;
  const imageCount = getFilteredAndSortedGallery().length;
  const totalItems = folderCount + imageCount;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (currentGalleryPage < totalPages) {
    currentGalleryPage++;
    showGallery(true);
  }
}

function prevGalleryPage() {
  if (currentGalleryPage > 1) {
    currentGalleryPage--;
    showGallery(true);
  }
}

function onGalleryFilterChange() {
  currentGalleryPage = 1;
  showGallery();
}

function updateDateButtonText(type, dateValue) {
  const btnId = type === 'start' ? 'gallery-start-date-btn' : 'gallery-end-date-btn';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  const textSpan = btn.querySelector('.date-button-text');
  if (!textSpan) return;
  
  if (dateValue) {
    const date = new Date(dateValue + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    textSpan.textContent = formatted;
    btn.classList.add('has-date');
  } else {
    textSpan.textContent = type === 'start' ? 'Start' : 'End';
    btn.classList.remove('has-date');
  }
}

function openImageViewer(index) {
  if (index < 0 || index >= galleryImages.length) return;
  
  currentViewerImageIndex = index;
  const item = galleryImages[index];
  
  const viewer = document.getElementById('image-viewer');
  const img = document.getElementById('viewer-image');
  const promptInput = document.getElementById('viewer-prompt');
  
  img.src = item.imageBase64;
  img.style.transform = 'scale(1) translate(0, 0)';
  viewerZoom = 1;
  
  promptInput.value = '';

  // Always reset preset header and loaded preset when opening a new image
  // (will be restored if returning from editor)
  window.viewerLoadedPreset = null;
  isGalleryLayerActive         = false;
  galleryLayerPresets          = [];
  const presetHeader = document.getElementById('viewer-preset-header');
  if (presetHeader) presetHeader.textContent = 'NO PRESET LOADED';

  // Show combined indicator if in combined mode
  const combinedIndicator = document.getElementById('viewer-combined-indicator');
  if (combinedIndicator) {
    if (window.isCombinedMode) combinedIndicator.classList.add('visible');
    else combinedIndicator.classList.remove('visible');
  }
  
  // Light up MP button if master prompt is enabled
  const mpBtn = document.getElementById('mp-viewer-button');
  if (mpBtn) {
    if (masterPromptEnabled) {
      mpBtn.classList.add('enabled');
    } else {
      mpBtn.classList.remove('enabled');
    }
  }

  viewer.style.display = 'flex';
  // Ensure both carousels are visible when viewer opens
  if (window.initViewerCarousels) window.initViewerCarousels();

  // hideGallery();

  document.getElementById('gallery-modal').style.display = 'none';
}

function closeImageViewer() {
  document.getElementById('image-viewer').style.display = 'none';
  currentViewerImageIndex = -1;
  viewerZoom = 1;
  window.viewerLoadedPreset = null;
  // When user exits the viewer, delete the combined temp image and clear combined mode
  if (window.isCombinedMode && window.pendingCombinedImageId) {
    const tempId = window.pendingCombinedImageId;
    window.isCombinedMode = false;
    window.pendingCombinedImageId = null;
    const tempIndex = galleryImages.findIndex(img => img.id === tempId);
    if (tempIndex >= 0) galleryImages.splice(tempIndex, 1);
    deleteImageFromDB(tempId).catch(err => console.error('Failed to delete temp combined image:', err));
  }
  // Hide combined indicator
  const combinedIndicator = document.getElementById('viewer-combined-indicator');
  if (combinedIndicator) combinedIndicator.classList.remove('visible');

  // Show gallery again without resuming camera
  const modal = document.getElementById('gallery-modal');
  modal.style.display = 'flex';
  // Don't call showGallery() as it would reload everything
  // Just refresh the grid
  showGallery(true);
}

async function deleteViewerImage() {
  if (currentViewerImageIndex < 0 || currentViewerImageIndex >= galleryImages.length) {
    return;
  }
  
  if (await confirm('Delete this image from gallery?')) {
    const imageToDelete = galleryImages[currentViewerImageIndex];
    
    // Remove from IndexedDB
    await deleteImageFromDB(imageToDelete.id);
    
    // Remove from memory array
    galleryImages.splice(currentViewerImageIndex, 1);
    
    document.getElementById('image-viewer').style.display = 'none';
    currentViewerImageIndex = -1;
    viewerZoom = 1;
    
    showGallery(true);
  }
}

function showPresetSelector() {
  const modal = document.getElementById('preset-selector');
  
  // CRITICAL FIX: Reset multi-preset mode when entering single-select mode
  isMultiPresetMode = false;
  isBatchPresetSelectionActive = false;
  selectedPresets = [];
  
  // Hide multi-preset controls if they exist
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) {
    multiControls.style.display = 'none';
  }
  
  // Reset header to single-select mode
  const header = modal.querySelector('.preset-selector-header h3');
  if (header) {
    header.innerHTML = 'Select Preset (<span id="preset-count">0</span>)';
  }
  
  populatePresetList();

  // Initialize preset count display
  const presetCountElement = document.getElementById('preset-count');
  if (presetCountElement) {
    presetCountElement.textContent = CAMERA_PRESETS.length;
  }

  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
  
  // Restore scroll position after DOM updates
  setTimeout(() => {
    const presetList = document.getElementById('preset-list');
    if (presetList && presetListScrollPosition > 0) {
      presetList.scrollTop = presetListScrollPosition;
    }
  }, 50);
}

function hidePresetSelector() {
  // Save scroll position before hiding
  const presetList = document.getElementById('preset-list');
  if (presetList) {
    presetListScrollPosition = presetList.scrollTop;
  }
  
  document.getElementById('preset-selector').style.display = 'none';
  isPresetSelectorOpen = false;
  currentPresetIndex_Gallery = 0;
  
  // Hide category hint

  // Clear special mode flags
  isBatchPresetSelectionActive = false;
  isMultiPresetMode = false;
}

function scrollPresetListUp() {
  if (!isPresetSelectorOpen) return;
  
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  currentPresetIndex_Gallery = Math.max(0, currentPresetIndex_Gallery - 1);
  updatePresetSelection();
}

function scrollPresetListDown() {
  if (!isPresetSelectorOpen) return;
  
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  currentPresetIndex_Gallery = Math.min(items.length - 1, currentPresetIndex_Gallery + 1);
  updatePresetSelection();
}

function updatePresetSelection() {
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('preset-selected');
  });

  // Add selection to current item
  if (currentPresetIndex_Gallery >= 0 && currentPresetIndex_Gallery < items.length) {
    const currentItem = items[currentPresetIndex_Gallery];
    currentItem.classList.add('preset-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Show category hint with individually clickable categories
    const presetName = currentItem.querySelector('.preset-name').textContent;
    const preset = CAMERA_PRESETS.find(p => p.name === presetName);
  }
}

function scrollSettingsUp() {
  if (!isSettingsSubmenuOpen) return;
  
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  currentSettingsIndex = Math.max(0, currentSettingsIndex - 1);
  updateSettingsSelection();
}

function scrollSettingsDown() {
  if (!isSettingsSubmenuOpen) return;
  
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  currentSettingsIndex = Math.min(items.length - 1, currentSettingsIndex + 1);
  updateSettingsSelection();
}

function updateSettingsSelection() {
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  // Add selection to current item
  if (currentSettingsIndex >= 0 && currentSettingsIndex < items.length) {
    const currentItem = items[currentSettingsIndex];
    currentItem.classList.add('menu-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollResolutionMenuUp() {
  const submenu = document.getElementById('resolution-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll('.resolution-item');
  if (items.length === 0) return;
  
  currentResolutionIndex_Menu = (currentResolutionIndex_Menu - 1 + items.length) % items.length;
  updateResolutionMenuSelection(items);
}

function scrollResolutionMenuDown() {
  const submenu = document.getElementById('resolution-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll('.resolution-item');
  if (items.length === 0) return;
  
  currentResolutionIndex_Menu = (currentResolutionIndex_Menu + 1) % items.length;
  updateResolutionMenuSelection(items);
}

function updateResolutionMenuSelection(items) {
  items.forEach(item => item.classList.remove('menu-selected'));
  
  if (currentResolutionIndex_Menu >= 0 && currentResolutionIndex_Menu < items.length) {
    const currentItem = items[currentResolutionIndex_Menu];
    currentItem.classList.add('menu-selected');
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollMasterPromptUp() {
  const submenu = document.getElementById('master-prompt-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollMasterPromptDown() {
  const submenu = document.getElementById('master-prompt-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollPresetBuilderUp() {
  if (!isPresetBuilderSubmenuOpen) return;
  
  const submenu = document.getElementById('preset-builder-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.preset-builder-form');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollPresetBuilderDown() {
  if (!isPresetBuilderSubmenuOpen) return;
  
  const submenu = document.getElementById('preset-builder-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.preset-builder-form');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollGalleryUp() {
  const modal = document.getElementById('gallery-modal');
  if (!modal || modal.style.display !== 'flex') return;
  
  const container = modal.querySelector('.gallery-scroll-container');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollGalleryDown() {
  const modal = document.getElementById('gallery-modal');
  if (!modal || modal.style.display !== 'flex') return;
  
  const container = modal.querySelector('.gallery-scroll-container');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollViewerUp() {
  const viewer = document.getElementById('image-viewer');
  if (!viewer || viewer.style.display !== 'flex') return;
  
  const container = viewer.querySelector('.viewer-controls');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollViewerDown() {
  const viewer = document.getElementById('image-viewer');
  if (!viewer || viewer.style.display !== 'flex') return;
  
  const container = viewer.querySelector('.viewer-controls');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollEditorUp() {
    const editor = document.getElementById('style-editor');
    if (!editor || editor.style.display !== 'flex') return;
    
    const messageField = document.getElementById('style-message');
    const container = editor.querySelector('.style-editor-body');

    // If you are typing in the message field, scroll the field itself
    if (document.activeElement === messageField) {
        messageField.scrollTop = Math.max(0, messageField.scrollTop - 100);
    } else if (container) {
        // Otherwise scroll the whole modal
        container.scrollTop = Math.max(0, container.scrollTop - 200);
    }
}

function scrollEditorDown() {
    const editor = document.getElementById('style-editor');
    if (!editor || editor.style.display !== 'flex') return;
    
    const messageField = document.getElementById('style-message');
    const container = editor.querySelector('.style-editor-body');

    // If you are typing in the message field, scroll the field itself
    if (document.activeElement === messageField) {
        messageField.scrollTop = Math.min(messageField.scrollHeight - messageField.clientHeight, messageField.scrollTop + 100);
    } else if (container) {
        // Otherwise scroll the whole modal
        container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 200);
    }
}

function scrollQueueUp() {
  const queue = document.getElementById('queue-manager');
  if (!queue || queue.style.display !== 'flex') return;
  
  const container = queue.querySelector('.queue-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollQueueDown() {
  const queue = document.getElementById('queue-manager');
  if (!queue || queue.style.display !== 'flex') return;
  
  const container = queue.querySelector('.queue-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function selectCurrentPresetItem() {
  if (!isPresetSelectorOpen) return;

  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0 || currentPresetIndex_Gallery >= items.length) return;

  const currentItem = items[currentPresetIndex_Gallery];
  if (currentItem) {
    // Trigger the click event
    currentItem.click();
  }
}

function populatePresetList() {
  const list = document.getElementById('preset-list');
  list.innerHTML = '';
  
  const filtered = getVisiblePresets().filter(preset => {
    // First apply text search filter
    
    // Then apply category filter if active
    
    return true;
  });
  
  // Sort alphabetically by name
  const sortedAll = filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  // Separate favorites and regular presets
  const favorites = sortedAll.filter(p => isFavoriteStyle(p.name));
  const regular = sortedAll.filter(p => !isFavoriteStyle(p.name));
  
  // Combine: favorites first, then regular
  const sorted = [...favorites, ...regular];
  
  if (sorted.length === 0) {
    list.innerHTML = '<div class="preset-empty">No presets found</div>';
    return;
  }
  
  sorted.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    
    const name = document.createElement('div');
    name.className = 'preset-name';
    name.textContent = preset.name;
    
    const message = document.createElement('div');
    message.className = 'preset-description preset-description-hidden';
    message.textContent = preset.message || '(No message — uses server default)';
    
    item.appendChild(name);
    item.appendChild(message);
    
    item.onclick = () => {
      // Toggle description visibility
      if (message.classList.contains('preset-description-hidden')) {
        message.classList.remove('preset-description-hidden');
      } else {
        // If description is showing, select the preset
        selectPreset(preset);
      }
    };
    
    list.appendChild(item);
  });
// Update preset count
  const presetCountElement = document.getElementById('preset-count');
  if (presetCountElement) {
    presetCountElement.textContent = sorted.length;
  }
}

async function selectPreset(preset) {
  // LAYER-preset mode — builds one combined prompt
  if (isLayerPresetMode) {
    const index = layerSelectedPresets.findIndex(p => p.name === preset.name);
    if (index !== -1) {
      // Deselect
      layerSelectedPresets.splice(index, 1);
    } else {
      if (layerSelectedPresets.length >= 5) {
        alert('Maximum 5 presets allowed in Layer mode. Deselect one first.');
        return;
      }
      layerSelectedPresets.push(preset);
    }
    updateLayerPresetList();
    return;
  }

  // Multi-preset mode
  if (isMultiPresetMode) {
    const index = selectedPresets.findIndex(p => p.name === preset.name);
    if (index !== -1) {
      selectedPresets.splice(index, 1);
    } else {
      if (selectedPresets.length >= 20) {
        alert('Maximum 20 presets allowed. Deselect one first.');
        return;
      }
      selectedPresets.push(preset);
    }
    updateMultiPresetList();
    return;
  }
  
  // Batch processing mode
  if (window.batchProcessingActive) {
    window.batchProcessingActive = false;
    const imagesToProcess = window.batchImagesToProcess;
    window.batchImagesToProcess = null;
    
    hidePresetSelector();
    
    const modal = document.getElementById('preset-selector');
    const header = modal.querySelector('.preset-selector-header h3');
    header.textContent = 'Select Preset';
    
    await processBatchImages(preset, imagesToProcess);
    return;
  }
  
 // Normal preset selection for viewer
  // Build full readable text including options and additional instructions
  const promptInput = document.getElementById('viewer-prompt');
  let fullText = preset.message || '';

  if (preset.randomizeOptions) {
    if (preset.optionGroups && preset.optionGroups.length > 0) {
      preset.optionGroups.forEach(group => {
        fullText += '\n\n' + group.title + ':\n';
        group.options.forEach((opt, i) => {
          fullText += '  ' + i + ': ' + opt.text + '\n';
        });
      });
    } else if (preset.options && preset.options.length > 0) {
      fullText += '\n\nOPTIONS:\n';
      preset.options.forEach((opt, i) => {
        fullText += '  ' + i + ': ' + opt.text + '\n';
      });
    }
  }

  if (preset.additionalInstructions && preset.additionalInstructions.trim()) {
    fullText += '\n\n' + preset.additionalInstructions;
  }

  promptInput.value = fullText;

  // Store the original preset so the Magic button uses the correct structured data
  window.viewerLoadedPreset = preset;

  // If layer mode was active, clear it — user has chosen a new single preset
  clearGalleryLayerState();

  // Update the preset name header
  const presetHeader = document.getElementById('viewer-preset-header');
  if (presetHeader) presetHeader.textContent = preset.name;

  hidePresetSelector();
}

async function submitMagicTransform() {
  if (currentViewerImageIndex < 0 || currentViewerImageIndex >= galleryImages.length) {
    alert('No image selected');
    return;
  }

  // GALLERY LAYER MODE

  if (isGalleryLayerActive && galleryLayerPresets.length > 0) {
    const item = galleryImages[currentViewerImageIndex];
    const resizedImageBase64 = await resizeImageForSubmission(item.imageBase64);
    const magicPrompt = buildCombinedLayerPrompt(galleryLayerPresets);
    if (typeof PluginMessageHandler !== 'undefined') {
      const layerMagicPayload = { pluginId: 'com.r1.pixelart', imageBase64: resizedImageBase64 };
      if (magicPrompt && magicPrompt.trim()) layerMagicPayload.message = magicPrompt;
      PluginMessageHandler.postMessage(JSON.stringify(layerMagicPayload));
      alert('Magic transform submitted! You can submit again with a different prompt.');
    } else {
      alert('Layer prompt built:\n\n' + magicPrompt.substring(0, 200) + '...');
    }
    return;
  }
  // END GALLERY LAYER MODE 

  const promptInput = document.getElementById('viewer-prompt');
  let prompt = promptInput.value.trim();
  let presetName = 'Custom Prompt';
  let matchedPreset = null;
  let manualSelection = null;
  
 // Check if this prompt matches a known preset (loaded via "Load Preset")
  // Use stored preset directly - textarea may contain expanded text so don't compare by message
  if (window.viewerLoadedPreset) {
    matchedPreset = window.viewerLoadedPreset;
    presetName = matchedPreset.name;
  } else if (prompt) {
    matchedPreset = CAMERA_PRESETS.find(p => p.message === prompt);
    if (matchedPreset) {
      presetName = matchedPreset.name;
    }
  }
  
  // If no prompt entered, only use a random preset if no preset was intentionally loaded
  if (!prompt && !window.viewerLoadedPreset) {
    const randomIndex = getRandomPresetIndex();
    const randomPreset = CAMERA_PRESETS[randomIndex];
    matchedPreset = randomPreset;
    prompt = randomPreset.message;
    presetName = randomPreset.name;
    
    // Show which preset was randomly selected
    alert(`Using random preset: ${presetName}`);
  
  // If manual options mode is OFF, check if user made inline selections in the viewer
  if (matchedPreset && matchedPreset.randomizeOptions) {
    const inlineSelection = collectViewerSelectedOptions(matchedPreset);
    if (inlineSelection !== null) {
      manualSelection = inlineSelection;
    }
  }
  
  const item = galleryImages[currentViewerImageIndex];
  const resizedImageBase64 = await resizeImageForSubmission(item.imageBase64);
  
  if (typeof PluginMessageHandler !== 'undefined') {
    // If gallery Layer mode is active, build the combined layer prompt instead
    let magicPrompt;
    if (isGalleryLayerActive && galleryLayerPresets.length > 0) {
      magicPrompt = buildCombinedLayerPrompt(galleryLayerPresets);
    } else {
      magicPrompt = getFinalPrompt(matchedPreset || {name: presetName, message: prompt, options: [], randomizeOptions: false, additionalInstructions: ''}, manualSelection);
    }
    const magicPayload = {
      pluginId: 'com.r1.pixelart',
      imageBase64: resizedImageBase64
    };
    if (magicPrompt && magicPrompt.trim()) {
      magicPayload.message = magicPrompt;
    }
    PluginMessageHandler.postMessage(JSON.stringify(magicPayload));

    // GALLERY CREDIT GAME — earn 1 credit if this is the first time using this imported preset

    try {
      const imported = presetImporter.getImportedPresets();
      const usedName = matchedPreset ? matchedPreset.name : presetName;
      const isImported = imported.some(p => p.name === usedName);
      if (isImported && usedName) {
        const credited = earnCredit(usedName);
        if (credited) {
          playTaDaSound();
          setTimeout(() => {
            const newTotal = getCredits();
            showGalleryCreditFlash(`🪙 Credit Earned!\n(${newTotal} total)`);
          }, 300);
        }
      }
    } catch (e) { /* non-critical */ }

    // Combined image stays active until user closes the viewer

    alert('Magic transform submitted! You can submit again with a different prompt.');
  } else {
    // Combined image stays active until user closes the viewer
    alert('Magic transform sent: ' + prompt.substring(0, 50) + '...');
  }
}

// Batch Mode Functions
function toggleBatchMode() {
  isBatchMode = !isBatchMode;
  const toggleBtn = document.getElementById('batch-mode-toggle');
  const batchControls = document.getElementById('batch-controls');
  const batchActionBar = document.getElementById('batch-action-bar');
  
  if (isBatchMode) {
    toggleBtn.textContent = 'Done';
    toggleBtn.classList.add('active');
    batchControls.style.display = 'flex';
    batchActionBar.style.display = 'flex';
    selectedBatchImages.clear();
    updateBatchSelection();
    showGallery(true);
  } else {
    toggleBtn.textContent = 'Select';
    toggleBtn.classList.remove('active');
    batchControls.style.display = 'none';
    batchActionBar.style.display = 'none';
    selectedBatchImages.clear();
    showGallery(true);
  }
}

function updateBatchSelection() {
  const countElement = document.getElementById('batch-selected-count');
  const applyButton = document.getElementById('batch-apply-preset');
  const deleteButton = document.getElementById('batch-delete');
  const combineButton = document.getElementById('batch-combine');
  
  countElement.textContent = `${selectedBatchImages.size} selected`;
  applyButton.disabled = selectedBatchImages.size === 0;
  if (deleteButton) {
    deleteButton.disabled = selectedBatchImages.size === 0;
  }
  // Combine only active when exactly 2 images selected
  if (combineButton) {
    combineButton.disabled = selectedBatchImages.size !== 2;
  }
}

function selectAllBatchImages() {
  selectedBatchImages.clear();
  // Include folders if at root
  if (currentFolderView === null) {
    galleryFolders.forEach(f => selectedBatchImages.add(f.id));
  }
  // Include images in current view
  getImagesInCurrentView().forEach(img => selectedBatchImages.add(img.id));
  updateBatchSelection();
  showGallery(true);
}

function deselectAllBatchImages() {
  selectedBatchImages.clear();
  updateBatchSelection();
  showGallery(true);
}

function toggleBatchImageSelection(imageId) {
  if (selectedBatchImages.has(imageId)) {
    selectedBatchImages.delete(imageId);
  } else {
    selectedBatchImages.add(imageId);
  }
  updateBatchSelection();

  // Update the checkbox and highlight directly in the DOM
  // so we don't need a full page reload on every click
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  grid.querySelectorAll('.gallery-item').forEach(container => {
    if (container.dataset.imageId === imageId) {
      const checkbox = container.querySelector('.gallery-item-checkbox');
      const selected = selectedBatchImages.has(imageId);
      if (checkbox) checkbox.checked = selected;
      if (selected) {
        container.classList.add('selected');
      } else {
        container.classList.remove('selected');
      }
    }
  });
}

async function applyPresetToBatch() {
  if (selectedBatchImages.size === 0) return;
  
  const modal = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.textContent = `Select Preset (${selectedBatchImages.size} images)`;

  // Set batch selection flag
  isBatchPresetSelectionActive = true;
  
  // Store which images to process
  const imagesToProcess = Array.from(selectedBatchImages);
  
  // Override selectPreset temporarily - store original first
  const originalSelectPreset = selectPreset;
  
  // Create a global flag
  window.batchProcessingActive = true;
  window.batchImagesToProcess = imagesToProcess;
  
  populatePresetList();
  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
}

async function processBatchImages(preset, imagesToProcess) {
  // Clear batch selection flag
  isBatchPresetSelectionActive = false;
  const selectedIds = imagesToProcess || Array.from(selectedBatchImages);
  const total = selectedIds.length;

  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Processing <span id="batch-current">0</span> / ${total}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let processed = 0;
  
  for (const imageId of selectedIds) {
    const image = galleryImages.find(img => img.id === imageId);
    if (!image) continue;
    
    try {
      const finalPrompt = getFinalPrompt(preset, null);
      const resizedImageBase64 = await resizeImageForSubmission(image.imageBase64);
      
      if (typeof PluginMessageHandler !== 'undefined') {
        const batchPayload = {
          pluginId: 'com.r1.pixelart',
          imageBase64: resizedImageBase64
        };
        if (finalPrompt && finalPrompt.trim()) {
          batchPayload.message = finalPrompt;
        }
        PluginMessageHandler.postMessage(JSON.stringify(batchPayload));
      }
      
      processed++;
      document.getElementById('batch-current').textContent = processed;
      document.getElementById('batch-progress-fill').style.width = `${(processed / total) * 100}%`;
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Failed to process image ${imageId}:`, error);
    }
  }
  
  document.body.removeChild(overlay);
  
  isBatchMode = false;
  selectedBatchImages.clear();
  toggleBatchMode();
  
  alert(`Batch processing complete! ${processed} of ${total} images submitted.`);
}

// Resize a base64 image to fit within 2048px wide while maintaining 3:4 aspect ratio
// Returns a new base64 string at the corrected size
async function resizeImageForSubmission(imageBase64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 2048;
      const TARGET_RATIO_W = 3;
      const TARGET_RATIO_H = 4;

      // Calculate canvas size to match 3:4 aspect ratio
      let canvasWidth = img.width;
      let canvasHeight = Math.round(canvasWidth * TARGET_RATIO_H / TARGET_RATIO_W);

      // If the image is taller than the 3:4 canvas, anchor to height instead
      if (img.height > canvasHeight) {
        canvasHeight = img.height;
        canvasWidth = Math.round(canvasHeight * TARGET_RATIO_W / TARGET_RATIO_H);
      }

      // Cap at 2048px wide
      if (canvasWidth > MAX_WIDTH) {
        const downScale = MAX_WIDTH / canvasWidth;
        canvasWidth = MAX_WIDTH;
        canvasHeight = Math.round(canvasHeight * downScale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // Black background (fills any letterbox padding)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Scale image to fit within the canvas, preserving its aspect ratio
      const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
      const drawW = Math.round(img.width * scale);
      const drawH = Math.round(img.height * scale);
      const offsetX = Math.floor((canvasWidth - drawW) / 2);
      const offsetY = Math.floor((canvasHeight - drawH) / 2);

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(imageBase64); // Fall back to original if load fails
    img.src = imageBase64;
  });
}

// ── CAMERA LIVE COMBINE MODE ──────────────────────────────────────────────

// Toggles camera live combine mode on/off.
function toggleCameraLiveCombineMode() {
  window.isCameraLiveCombineMode = !window.isCameraLiveCombineMode;
  window.cameraCombineFirstPhoto = null; // reset any pending first photo

  const btn = document.getElementById('camera-combine-toggle');
  if (btn) {
    if (window.isCameraLiveCombineMode) {
      btn.classList.add('combine-active');
            showStyleReveal('🖼️🖼️ COMBINE ON\nTAKE 1ST PHOTO');
    } else {
      btn.classList.remove('combine-active');
            notifyPresetChange();
    }
  }
}

// Takes two base64 images and returns a combined base64 using the same
// side-by-side 3:4 canvas logic as the gallery combine function.
async function buildCombinedImageBase64(base64A, base64B) {
  // Resize each photo to valid resolution and 3:4 aspect ratio before combining,
  // so the combined canvas dimensions are consistent with gallery combine behaviour.
  const [resizedA, resizedB] = await Promise.all([
    resizeImageForSubmission(base64A),
    resizeImageForSubmission(base64B)
  ]);

  const loadImg = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });

  const [imageA, imageB] = await Promise.all([loadImg(resizedA), loadImg(resizedB)]);

  const targetHeight = Math.max(imageA.height, imageB.height);
  const scaleA = targetHeight / imageA.height;
  const scaleB = targetHeight / imageB.height;
  const totalWidth = Math.round(imageA.width * scaleA) + Math.round(imageB.width * scaleB);

  const targetRatioW = 3;
  const targetRatioH = 4;
  let canvasWidth = totalWidth;
  let canvasHeight = Math.round(canvasWidth * targetRatioH / targetRatioW);

  if (targetHeight > canvasHeight) {
    canvasHeight = targetHeight;
    canvasWidth = Math.round(canvasHeight * targetRatioW / targetRatioH);
  }

  const MAX_WIDTH = 2048;
  if (canvasWidth > MAX_WIDTH) {
    const downScale = MAX_WIDTH / canvasWidth;
    canvasWidth = MAX_WIDTH;
    canvasHeight = Math.round(canvasHeight * downScale);
  }

  const halfCanvas = Math.floor(canvasWidth / 2);
  const finalHeightA = Math.round(imageA.height * (halfCanvas / imageA.width));
  const finalHeightB = Math.round(imageB.height * (halfCanvas / imageB.width));

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.drawImage(imageA, 0, Math.floor((canvasHeight - finalHeightA) / 2), halfCanvas, finalHeightA);
  ctx.drawImage(imageB, halfCanvas, Math.floor((canvasHeight - finalHeightB) / 2), halfCanvas, finalHeightB);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(halfCanvas, 0);
  ctx.lineTo(halfCanvas, canvasHeight);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.92);
}

// Called after both photos are taken in camera live combine mode.
// Combines them and sends the result with the appropriate preset.
async function finalizeCameraLiveCombine(photo1Base64, photo2Base64, presetOverride, isVoiceMode) {
  try {
    
    const combinedBase64 = await buildCombinedImageBase64(photo1Base64, photo2Base64);
    // Combined image is kept in memory only — not saved to the gallery.
    // The two individual photos were already saved to the gallery when captured.

    // Determine which preset to use
    let preset;
    if (presetOverride) {
      // Voice mode: use the spoken preset exactly as-is, no combine preamble
      preset = presetOverride;
    } else if (isCameraMultiPresetActive && cameraSelectedPresets.length > 0) {
      // Multi-preset mode: handled separately below
      preset = null;
    } else if (isCameraLayerActive && cameraLayerPresets.length > 0) {
      // Layer mode: handled separately below
      preset = null;
    } else if (isRandomMode) {
      currentPresetIndex = getRandomPresetIndex();
      preset = CAMERA_PRESETS[currentPresetIndex];
      showStyleReveal(preset.name);
    } else {
      preset = CAMERA_PRESETS[currentPresetIndex];
    }

    // Build the queue item(s) and send
    if (isCameraMultiPresetActive && cameraSelectedPresets.length > 0 && !presetOverride) {
      // Multi-preset combine: one queue item per preset, all with the combined image
      const presetsToApply = [...cameraSelectedPresets];
      for (let i = 0; i < presetsToApply.length; i++) {
        const p = presetsToApply[i];
        const manualSelection = null;

        // Apply combine preamble for multi-preset (not voice mode)
        window.isCombinedMode = true;
        const finalPrompt = getFinalPrompt(p, manualSelection);
        window.isCombinedMode = false;

        const queueItem = {
          id: Date.now().toString() + '-cam-comb-mp' + i,
          imageBase64: combinedBase64,
          preset: p,
          manualSelection: manualSelection,
          isCombined: true,
          timestamp: Date.now()
        };
        photoQueue.push(queueItem);
      }
      saveQueue();
      updateQueueDisplay();

      if (isOnline && !noMagicMode) {
                if (!isSyncing) syncQueuedPhotos();
      } else {
              }

    } else if (isCameraLayerActive && cameraLayerPresets.length > 0 && !presetOverride) {
      // Layer combine: merge all layer presets into ONE prompt, apply combine preamble to primary
      const combinedPrompt = buildCombinedLayerPrompt(cameraLayerPresets);
      const queueItem = {
        id: Date.now().toString() + '-layer-comb',
        imageBase64: combinedBase64,
        preset: {
          name: 'Layer: ' + cameraLayerPresets.map(p => p.name).join(' + '),
          message: combinedPrompt,
          options: [],
          randomizeOptions: false,
          additionalInstructions: ''
        },
        isCombined: false,
        timestamp: Date.now()
      };
      photoQueue.push(queueItem);
      saveQueue();
      updateQueueDisplay();

      if (isOnline && !noMagicMode) {
                if (!isSyncing) syncQueuedPhotos();
      } else {
              }

        // Layer mode persists — user must tap the lit button to clear it

      } else if (preset) {
      // Single preset path
      // For voice mode the preset message is already the full spoken intent —
      // do NOT apply the combine preamble (user described what they wanted).
      // For normal/random mode, apply the combine preamble.

      let finalPrompt;
      if (isVoiceMode) {
        finalPrompt = getFinalPrompt(preset, null); // no combine preamble
      } else {
        window.isCombinedMode = true;
        finalPrompt = getFinalPrompt(preset, null);
        window.isCombinedMode = false;
      }

      const queueItem = {
        id: Date.now().toString() + '-cam-comb',
        imageBase64: combinedBase64,
        preset: preset,
        isCombined: !isVoiceMode,
        timestamp: Date.now()
      };
      photoQueue.push(queueItem);
      saveQueue();
      updateQueueDisplay();

      if (isOnline && !noMagicMode) {
                if (!isSyncing) syncQueuedPhotos();
      } else {
              }
    }

    // Clean up combine mode state
    window.isCameraLiveCombineMode = false;
    window.cameraCombineFirstPhoto = null;
    const btn = document.getElementById('camera-combine-toggle');
    if (btn) btn.classList.remove('combine-active');

  } catch (err) {
    console.error('Camera live combine failed:', err);
        window.cameraCombineFirstPhoto = null;
  }
}

// END CAMERA LIVE COMBINE MODE

// GALLERY FOLDER FUNCTIONS

function loadFolders() {
  try {
    const saved = localStorage.getItem(FOLDERS_STORAGE_KEY);
    galleryFolders = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(galleryFolders)) galleryFolders = [];
  } catch (e) {
    galleryFolders = [];
  }
}

function saveFolders() {
  localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(galleryFolders));
}

function createNewFolder() {
  const id = 'folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  const folder = { id, name: 'New Folder', createdAt: Date.now() };
  galleryFolders.push(folder);
  saveFolders();
  showGallery(true);
  // Immediately enter rename mode for the new folder
  setTimeout(() => startFolderRename(id), 100);
}

function startFolderRename(folderId) {
  const el = document.querySelector(`.gallery-folder[data-folder-id="${folderId}"]`);
  if (!el) return;
  el.classList.add('gallery-folder-renaming');
  const nameEl = el.querySelector('.gallery-folder-name');
  const folder = galleryFolders.find(f => f.id === folderId);
  if (!folder) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'gallery-folder-rename-input';
  input.value = folder.name === 'New Folder' ? '' : folder.name;
  input.placeholder = 'Folder name';
  input.maxLength = 30;
  el.appendChild(input);
  input.focus();

  const save = () => {
    const newName = input.value.trim() || 'New Folder';
    folder.name = newName;
    saveFolders();
    el.classList.remove('gallery-folder-renaming');
    input.remove();
    if (nameEl) nameEl.textContent = newName;
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  });
}

function openFolderView(folderId) {
  currentFolderView = folderId;
  currentGalleryPage = 1;
  showGallery(true);
}

function closeFolderView() {
  currentFolderView = null;
  currentGalleryPage = 1;
  showGallery(true);
}

function getImagesInCurrentView() {
  // Returns images belonging to the current view (root or folder)
  if (currentFolderView === null) {
    return galleryImages.filter(img => !img.folderId && !img.isCombinedTemp);
  } else {
    return galleryImages.filter(img => img.folderId === currentFolderView);
  }
}

async function moveSelectedImagesToFolder(targetFolderId) {
  // targetFolderId = null means move to root gallery
  const ids = Array.from(selectedBatchImages);
  for (const imageId of ids) {
    const img = galleryImages.find(i => i.id === imageId);
    if (!img) continue;
    if (targetFolderId === null) {
      delete img.folderId;
    } else {
      img.folderId = targetFolderId;
    }
    // Persist the updated folderId to IndexedDB
    await saveImageToDB(img);
  }
  selectedBatchImages.clear();
  updateBatchSelection();
  showGallery(true);
}

function showMoveToFolderModal() {
  if (selectedBatchImages.size === 0) return;
  const modal = document.getElementById('move-to-folder-modal');
  const list = document.getElementById('move-to-folder-list');
  list.innerHTML = '';

  // Gallery (root) option
  const rootItem = document.createElement('div');
  rootItem.className = 'move-to-folder-item gallery-root';
  rootItem.innerHTML = '🖼️ Gallery (root)';
  rootItem.addEventListener('click', async () => {
    modal.style.display = 'none';
    await moveSelectedImagesToFolder(null);
  });
  list.appendChild(rootItem);

  // Each folder
  galleryFolders.forEach(folder => {
    const item = document.createElement('div');
    item.className = 'move-to-folder-item';
    item.innerHTML = `📁 ${folder.name}`;
    item.addEventListener('click', async () => {
      modal.style.display = 'none';
      await moveSelectedImagesToFolder(folder.id);
    });
    list.appendChild(item);
  });

  modal.style.display = 'flex';
}

async function deleteFolderAndContents(folderId) {
  // When a folder is deleted, move its images back to root
  for (const img of galleryImages) {
    if (img.folderId === folderId) {
      delete img.folderId;
      await saveImageToDB(img);
    }
  }
  galleryFolders = galleryFolders.filter(f => f.id !== folderId);
  saveFolders();
  if (currentFolderView === folderId) {
    currentFolderView = null;
  }
}

// END GALLERY FOLDER FUNCTIONS

async function combineTwoImages() {
  if (selectedBatchImages.size !== 2) {
    alert('Please select exactly 2 images to combine.');
    return;
  }

  const ids = Array.from(selectedBatchImages);
  const imgA = galleryImages.find(img => img.id === ids[0]);
  const imgB = galleryImages.find(img => img.id === ids[1]);

  if (!imgA || !imgB) {
    alert('Could not find selected images.');
    return;
  }

  try {
    showGalleryStatusMessage('Combining images...', 'info', 0);

    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });

    const [imageA, imageB] = await Promise.all([
      loadImage(imgA.imageBase64),
      loadImage(imgB.imageBase64)
    ]);

    // Scale both images to the same height (the taller one sets the height)
    // then place side by side — no cropping
    const targetHeight = Math.max(imageA.height, imageB.height);

    // Scale each image proportionally to targetHeight
    const scaleA = targetHeight / imageA.height;
    const scaleB = targetHeight / imageB.height;
    const scaledWidthA = Math.round(imageA.width * scaleA);
    const scaledWidthB = Math.round(imageB.width * scaleB);
    const totalWidth = scaledWidthA + scaledWidthB;

    // Enforce 3:4 aspect ratio (width:height = 3:4) for the combined canvas
    // Fit within this ratio without cropping — pad with black if needed
    const targetRatioW = 3;
    const targetRatioH = 4;

    // Canvas height based on 3:4 from total width
    let canvasWidth = totalWidth;
    let canvasHeight = Math.round(canvasWidth * targetRatioH / targetRatioW);

    // If the images at targetHeight are taller than the 3:4 canvas, scale down
    if (targetHeight > canvasHeight) {
      canvasHeight = targetHeight;
      canvasWidth = Math.round(canvasHeight * targetRatioW / targetRatioH);
    }

    // Cap at 2048px wide to stay within safe canvas limits
    const MAX_WIDTH = 2048;
    if (canvasWidth > MAX_WIDTH) {
      const downScale = MAX_WIDTH / canvasWidth;
      canvasWidth = MAX_WIDTH;
      canvasHeight = Math.round(canvasHeight * downScale);
    }

    // Recalculate image widths to fit within the canvas width (half each)
    const halfCanvas = Math.floor(canvasWidth / 2);
    const finalHeightA = Math.round(imageA.height * (halfCanvas / imageA.width));
    const finalHeightB = Math.round(imageB.height * (halfCanvas / imageB.width));

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw image A on left half, vertically centred, no cropping
    const offsetAY = Math.floor((canvasHeight - finalHeightA) / 2);
    ctx.drawImage(imageA, 0, offsetAY, halfCanvas, finalHeightA);

    // Draw image B on right half, vertically centred, no cropping
    const offsetBY = Math.floor((canvasHeight - finalHeightB) / 2);
    ctx.drawImage(imageB, halfCanvas, offsetBY, halfCanvas, finalHeightB);

    // Dividing line
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfCanvas, 0);
    ctx.lineTo(halfCanvas, canvasHeight);
    ctx.stroke();

    const combinedBase64 = canvas.toDataURL('image/jpeg', 0.92);

    // Save as temporary combined image — flagged for deletion after use
    const tempId = Date.now().toString() + '-combined-' + Math.random().toString(36).substr(2, 9);
    const newImageData = {
      id: tempId,
      imageBase64: combinedBase64,
      timestamp: Date.now(),
      isCombinedTemp: true
    };

    galleryImages.unshift(newImageData);
    await saveImageToDB(newImageData);

    // Store the combined image ID so we can delete it after sending
    window.pendingCombinedImageId = tempId;
    window.isCombinedMode = true;

    // Exit batch mode silently
    isBatchMode = false;
    selectedBatchImages.clear();
    const toggleBtn = document.getElementById('batch-mode-toggle');
    const batchControls = document.getElementById('batch-controls');
    const batchActionBar = document.getElementById('batch-action-bar');
    if (toggleBtn) { toggleBtn.textContent = 'Select'; toggleBtn.classList.remove('active'); }
    if (batchControls) batchControls.style.display = 'none';
    if (batchActionBar) batchActionBar.style.display = 'none';

    // Open the combined image in the viewer immediately
    await showGallery();
    const newIndex = galleryImages.findIndex(img => img.id === tempId);
    if (newIndex >= 0) {
      document.getElementById('gallery-modal').style.display = 'none';
      openImageViewer(newIndex);
    }

    showGalleryStatusMessage(
      '✅ Images combined! Now select a preset and tap ✨ MAGIC to transform both subjects.',
      'success',
      5000
    );

  } catch (err) {
    window.isCombinedMode = false;
    window.pendingCombinedImageId = null;
    console.error('Combine failed:', err);
    showGalleryStatusMessage('Failed to combine images: ' + err.message, 'error', 4000);
  }
}

async function batchDeleteImages() {
  if (selectedBatchImages.size === 0) return;
  
  const count = selectedBatchImages.size;
  const confirmed = await confirm(`Are you sure you want to delete ${count} selected image${count > 1 ? 's' : ''}? This cannot be undone.`);
  
  if (!confirmed) return;
  
  // Separate folders from images in the selection
  const foldersToDelete = Array.from(selectedBatchImages).filter(id => id.startsWith('folder-'));
  const imagesToDelete = Array.from(selectedBatchImages).filter(id => !id.startsWith('folder-'));

  // Delete selected folders (images inside move to root)
  for (const folderId of foldersToDelete) {
    await deleteFolderAndContents(folderId);
  }
  
  // Show progress
  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Deleting <span id="batch-current">0</span> / ${count}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let deleted = 0;
  
  for (const imageId of imagesToDelete) {
    try {
      await deleteImageFromDB(imageId);
      deleted++;
      document.getElementById('batch-current').textContent = deleted;
      document.getElementById('batch-progress-fill').style.width = `${(deleted / count) * 100}%`;
    } catch (error) {
      console.error(`Failed to delete image ${imageId}:`, error);
    }
  }
  
  document.body.removeChild(overlay);

  // Exit batch mode cleanly — set flag first then update UI without toggling
  isBatchMode = false;
  selectedBatchImages.clear();
  await loadGallery();

  // Update UI to reflect batch mode is off without calling toggleBatchMode()
  // (toggleBatchMode would flip isBatchMode back to true since it's already false)
  const toggleBtn = document.getElementById('batch-mode-toggle');
  const batchControls = document.getElementById('batch-controls');
  const batchActionBar = document.getElementById('batch-action-bar');
  if (toggleBtn) { toggleBtn.textContent = 'Select'; toggleBtn.classList.remove('active'); }
  if (batchControls) batchControls.style.display = 'none';
  if (batchActionBar) batchActionBar.style.display = 'none';

  showGallery(true);

  const totalDeleted = deleted + foldersToDelete.length;
  alert(`${totalDeleted} item${totalDeleted !== 1 ? 's' : ''} deleted successfully.`);
}

function openMultiPresetSelector(imageId) {
  multiPresetImageId = imageId;
  selectedPresets = [];
  isMultiPresetMode = true;
  
  const modal = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.innerHTML = 'Select Presets <span id="multi-preset-count" style="font-size: 12px; color: #666;">(0 selected)</span>';
  
  // Add multi-select controls if not already there
  let multiControls = document.getElementById('multi-preset-controls');
  if (!multiControls) {
    multiControls = document.createElement('div');
    multiControls.id = 'multi-preset-controls';
    multiControls.style.cssText = 'padding: 1vw 8px; background: #000; border-bottom: 1px solid #333; display: flex; gap: 2vw; justify-content: flex-start; align-items: center;';
    multiControls.innerHTML = `
      <button id="multi-preset-apply" class="batch-control-button" style="background: #4CAF50; color: white; height: 8vw; min-height: 32px;">Apply Selected</button>
      <button id="multi-preset-cancel" class="batch-control-button" style="height: 8vw; min-height: 32px;">Cancel</button>
    `;
    
    const filterRow = presetFilter.closest('.filter-row') || presetFilter.parentNode;
    const presetList = document.getElementById('preset-list');
    filterRow.parentNode.insertBefore(multiControls, filterRow);
  }
  multiControls.style.display = 'flex';
  
  populatePresetList();
  updateMultiPresetList();
  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
  
  // Add event listeners for multi-preset controls
  document.getElementById('multi-preset-apply').onclick = applyMultiplePresets;
  document.getElementById('multi-preset-cancel').onclick = cancelMultiPresetMode;
}

function updateMultiPresetList() {
  const presetList = document.getElementById('preset-list');
  const items = presetList.querySelectorAll('.preset-item');
  
  items.forEach(item => {
    const presetName = item.querySelector('.preset-name').textContent;
    const isSelected = selectedPresets.some(p => p.name === presetName);
    
    if (isSelected) {
      item.style.background = '#e8f5e9';
      item.style.border = '2px solid #4CAF50';
    } else {
      item.style.background = '';
      item.style.border = '';
    }
  });
  
  const countSpan = document.getElementById('multi-preset-count');
  if (countSpan) {
    countSpan.textContent = `(${selectedPresets.length} selected)`;
  }
}

// Open multi-preset selector from the main camera carousel button
function openCameraMultiPresetSelector() {
  // Disabled when No Magic Mode is on
  if (noMagicMode) {
        setTimeout(() => notifyPresetChange(), 2000);
    return;
  }
  // Re-use the gallery preset selector modal
  const modal = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.innerHTML = 'Select Presets (max 20) <span id="multi-preset-count" style="font-size: 12px; color: #aaa;">(0 selected)</span>';

  // Switch to camera-multi mode (not gallery multi mode)
  isMultiPresetMode = true;
  isCameraMultiPresetActive = false; // will be set true on Apply
  selectedPresets = [...cameraSelectedPresets]; // pre-populate with current selections

  // Add multi-select controls
  let multiControls = document.getElementById('multi-preset-controls');
  if (!multiControls) {
    multiControls = document.createElement('div');
    multiControls.id = 'multi-preset-controls';
    multiControls.style.cssText = 'padding: 1vw 8px; background: #000; border-bottom: 1px solid #333; display: flex; gap: 2vw; justify-content: flex-start; align-items: center;';
    multiControls.innerHTML = `
      <button id="multi-preset-apply" class="batch-control-button" style="background: #4CAF50; color: white; height: 8vw; min-height: 32px;">Apply Selected</button>
      <button id="multi-preset-cancel" class="batch-control-button" style="height: 8vw; min-height: 32px;">Cancel</button>
    `;
    const filterRow = presetFilter.closest('.filter-row') || presetFilter.parentNode;
    const presetList = document.getElementById('preset-list');
    filterRow.parentNode.insertBefore(multiControls, filterRow);
  }
  multiControls.style.display = 'flex';

  populatePresetList();
  updateMultiPresetList();
  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();

  // Wire up buttons for camera context
  document.getElementById('multi-preset-apply').onclick = applyCameraMultiPresets;
  document.getElementById('multi-preset-cancel').onclick = cancelCameraMultiPresetSelector;
}

function cancelCameraMultiPresetSelector() {
  isMultiPresetMode = false;
  selectedPresets = [];
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) multiControls.style.display = 'none';
  const header = document.querySelector('.preset-selector-header h3');
  if (header) header.textContent = 'Select Preset';
  hidePresetSelector();
  // Return to camera, no changes
}

function applyCameraMultiPresets() {
  if (selectedPresets.length === 0) {
    alert('Please select at least one preset');
    return;
  }
  if (selectedPresets.length > 20) {
    alert('Maximum 20 presets allowed');
    return;
  }

  cameraSelectedPresets = [...selectedPresets];
  isCameraMultiPresetActive = true;

  isMultiPresetMode = false;
  selectedPresets = [];
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) multiControls.style.display = 'none';
  const header = document.querySelector('.preset-selector-header h3');
  if (header) header.textContent = 'Select Preset';
  hidePresetSelector();

  // Highlight the carousel button
  const btn = document.getElementById('camera-multi-preset-toggle');
  if (btn) btn.classList.add('camera-multi-active');

    saveCameraMultiPresets();
    notifyPresetChange();
  }
}

function cancelMultiPresetMode() {
  isMultiPresetMode = false;
  multiPresetImageId = null;
  selectedPresets = [];
  
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) {
    multiControls.style.display = 'none';
  }
  
  const header = document.querySelector('.preset-selector-header h3');
  header.textContent = 'Select Preset';
  
  hidePresetSelector();
}

async function applyMultiplePresets() {
  if (selectedPresets.length === 0) {
    alert('Please select at least one preset');
    return;
  }
  
  if (!multiPresetImageId) {
    alert('No image selected');
    return;
  }
  
  const image = galleryImages.find(img => img.id === multiPresetImageId);
  if (!image) {
    alert('Image not found');
    return;
  }
  
  // Save presets before canceling mode (which clears the array)
  const presetsToApply = [...selectedPresets];

  // Clear layer mode — user has chosen new multi presets
  clearGalleryLayerState();
  const multiHeader = document.getElementById('viewer-preset-header');
  if (multiHeader) multiHeader.textContent = `🎞️ MULTI (${presetsToApply.length})`;

  cancelMultiPresetMode();

  // Now feed each preset one by one with the saved selections
  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Applying preset <span id="batch-current">0</span> / ${presetsToApply.length}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let processed = 0;
  
  const resizedImageBase64 = await resizeImageForSubmission(image.imageBase64);

  for (const preset of presetsToApply) {
    try {
      const manualSelection = null;
      const finalPrompt = getFinalPrompt(preset, manualSelection);
      
      if (typeof PluginMessageHandler !== 'undefined') {
        const multiPayload = {
          pluginId: 'com.r1.pixelart',
          imageBase64: resizedImageBase64
        };
        if (finalPrompt && finalPrompt.trim()) {
          multiPayload.message = finalPrompt;
        }
        PluginMessageHandler.postMessage(JSON.stringify(multiPayload));
      }
      
      processed++;
      document.getElementById('batch-current').textContent = processed;
      document.getElementById('batch-progress-fill').style.width = `${(processed / presetsToApply.length) * 100}%`;
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Failed to apply preset ${preset.name}:`, error);
    }
  }
  
  document.body.removeChild(overlay);
  alert(`${processed} preset${processed > 1 ? 's' : ''} applied successfully!`);
}

function setupViewerPinchZoom() {
  const img = document.getElementById('viewer-image');
  const container = document.querySelector('.image-viewer-container');
  
  let translateX = 0;
  let translateY = 0;
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  // Clamp pan so the image never moves outside the container bounds
  function clampTranslate(tx, ty) {
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imgW = img.naturalWidth || img.clientWidth;
    const imgH = img.naturalHeight || img.clientHeight;

    // How much the scaled image overflows each side
    // The image is displayed at object-fit:contain so its rendered size fits inside container
    const renderedW = Math.min(containerW, imgW * (containerH / imgH));
    const renderedH = Math.min(containerH, imgH * (containerW / imgW));

    // Max translation: half the overflow in each direction, in unscaled pixels
    const maxX = Math.max(0, (renderedW * viewerZoom - containerW) / 2 / viewerZoom);
    const maxY = Math.max(0, (renderedH * viewerZoom - containerH) / 2 / viewerZoom);

    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty))
    };
  }

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      viewerIsPinching = true;
      viewerInitialPinchDistance = getDistance(e.touches[0], e.touches[1]);
      viewerInitialZoom = viewerZoom;
    } else if (e.touches.length === 1 && viewerZoom > 1) {
      isDragging = true;
      startX = e.touches[0].clientX - translateX;
      startY = e.touches[0].clientY - translateY;
    }
  }, { passive: false });
  
  container.addEventListener('touchmove', (e) => {
    if (viewerIsPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / viewerInitialPinchDistance;
      viewerZoom = Math.max(1, Math.min(viewerInitialZoom * scale, 5));

      // Re-clamp translation at the new zoom level
      const clamped = clampTranslate(translateX, translateY);
      translateX = clamped.x;
      translateY = clamped.y;

      img.style.transform = `scale(${viewerZoom}) translate(${translateX}px, ${translateY}px)`;
    } else if (isDragging && e.touches.length === 1 && viewerZoom > 1) {
      e.preventDefault();
      const rawX = e.touches[0].clientX - startX;
      const rawY = e.touches[0].clientY - startY;

      const clamped = clampTranslate(rawX, rawY);
      translateX = clamped.x;
      translateY = clamped.y;

      img.style.transform = `scale(${viewerZoom}) translate(${translateX}px, ${translateY}px)`;
    }
  }, { passive: false });
  
  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      viewerIsPinching = false;
    }
    if (e.touches.length === 0) {
      isDragging = false;
      if (viewerZoom === 1) {
        translateX = 0;
        translateY = 0;
        img.style.transform = 'scale(1) translate(0, 0)';
      }
    }
  });
  
  container.addEventListener('touchcancel', () => {
    viewerIsPinching = false;
    isDragging = false;
  });
}

function getDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateMenuSelection() {
  if (!isMenuOpen) return;

  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  currentMenuIndex = Math.max(0, Math.min(currentMenuIndex, items.length - 1));

  const currentItem = items[currentMenuIndex];
  if (currentItem) {
    currentItem.classList.add('menu-selected');
    
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
    
    // Show category hint with individually clickable categories
    const presetIndex = parseInt(currentItem.dataset.index);
    const preset = CAMERA_PRESETS[presetIndex];
  }
}

let currentSubmenuIndex = 0;

function scrollSubmenuUp(submenuId, itemSelector) {
  const submenu = document.getElementById(submenuId);
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll(itemSelector);
  if (items.length === 0) return;
  
  currentSubmenuIndex = (currentSubmenuIndex - 1 + items.length) % items.length;
  updateSubmenuSelection(submenu, items);
}

function scrollSubmenuDown(submenuId, itemSelector) {
  const submenu = document.getElementById(submenuId);
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll(itemSelector);
  if (items.length === 0) return;
  
  currentSubmenuIndex = (currentSubmenuIndex + 1) % items.length;
  updateSubmenuSelection(submenu, items);
}

function updateSubmenuSelection(submenu, items) {
  items.forEach(item => item.classList.remove('menu-selected'));
  
  if (currentSubmenuIndex >= 0 && currentSubmenuIndex < items.length) {
    const currentItem = items[currentSubmenuIndex];
    currentItem.classList.add('menu-selected');
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function resetSubmenuIndex() {
  currentSubmenuIndex = 0;
}

function scrollMenuUp() {
  if (!isMenuOpen || !menuScrollEnabled) return;
  
  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentMenuIndex = Math.max(0, currentMenuIndex - 1);
  updateMenuSelection();
}

function scrollMenuDown() {
  if (!isMenuOpen || !menuScrollEnabled) return;
  
  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentMenuIndex = Math.min(items.length - 1, currentMenuIndex + 1);
  updateMenuSelection();
}

function selectCurrentMenuItem() {
  if (!isMenuOpen || !menuScrollEnabled) return;

  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0 || currentMenuIndex >= items.length) return;

  const currentItem = items[currentMenuIndex];
  if (currentItem) {
    const styleNameElement = currentItem.querySelector('.style-name');
    if (styleNameElement) {
      const sortedPresets = getSortedPresets();
      const selectedPreset = sortedPresets[currentMenuIndex];
      if (selectedPreset) {
        const originalIndex = CAMERA_PRESETS.findIndex(p => p === selectedPreset);
        if (originalIndex !== -1) {
          currentPresetIndex = originalIndex;
          notifyPresetChange();
          hideUnifiedMenu();
        }
      }
    }
  }
}

// Load saved styles
async function loadStyles() {
    // Initialize IndexedDB storage
    await presetStorage.init();
    await presetImporter.init();
    
    // Check if this is truly a first-time user
    const importedPresets = await presetImporter.loadImportedPresets();
    const hasImports = importedPresets.length > 0;
    
    // Check if there are any user modifications
    const modifications = await presetStorage.getAllModifications();
    const hasModifications = modifications.length > 0;
    
    // Always fetch the real preset count so the tutorial display is always correct
    try {
        showLoadingOverlay('Loading presets...');
        const allFactoryPresets = await presetImporter.loadPresetsFromFile();
        totalFactoryPresetCount = allFactoryPresets.length;
        const tutorialCountEl = document.getElementById('tutorial-preset-count');
        if (tutorialCountEl) tutorialCountEl.textContent = totalFactoryPresetCount;
    } catch (e) {
        console.log('Could not fetch preset count:', e);
    } finally {
        hideLoadingOverlay();
    }

    favoriteStyles = [];
    loadResolution();
    // loadWhiteBalanceSettings();

    // Initialize CAMERA_PRESETS from presets.json
    try {
      const allFactoryPresets = await presetImporter.loadPresetsFromFile();
      CAMERA_PRESETS = [...allFactoryPresets];
      totalFactoryPresetCount = allFactoryPresets.length;
    } catch (e) {
      console.log('Could not load presets:', e);
      CAMERA_PRESETS = [];
    }

    loadLastUsedStyle();

    visiblePresets = CAMERA_PRESETS.map(p => p.name);
    updateVisiblePresetsDisplay();
}

async function checkForPresetsUpdates() {
  // Disabled - no import system needed anymore
}

// Re-checks presets.json against currently imported presets and updates
// the settings button indicator to accurately reflect remaining updates.

async function recheckForUpdates() {
  try {
    const jsonPresets = await presetImporter.loadPresetsFromFile();
    const importedPresets = presetImporter.getImportedPresets();

    let stillHasUpdates = false;
    for (const jsonPreset of jsonPresets) {
      const existing = importedPresets.find(p => p.name === jsonPreset.name);
      if (!existing || existing.message !== jsonPreset.message) {
        stillHasUpdates = true;
        break;
      }
    }

    window.hasPresetsUpdates = stillHasUpdates;

    const statusElement = document.getElementById('updates-status');
    if (statusElement) {
      if (stillHasUpdates) {
                statusElement.style.color = '#FF5722';
        statusElement.style.fontWeight = 'bold';
      } else {
                statusElement.style.color = '';
        statusElement.style.fontWeight = '';
      }
    }
  } catch (error) {
    console.log('Could not recheck for updates:', error);
  }
}

// Update master prompt indicator visibility
function updateMasterPromptIndicator() {
  const mpIndicator = document.getElementById('master-prompt-indicator');
  const startScreen = document.getElementById('start-screen');
  if (mpIndicator) {
    // Only show if master prompt enabled AND start screen is gone
    mpIndicator.style.display = (masterPromptEnabled && !startScreen) ? 'block' : 'none';
  }
}

async function mergePresetsWithStorage() {
  const modifications = await presetStorage.getAllModifications();
  const deletedNames = new Set();
  const modifiedData = new Map();
  const newPresets = [];

  // Process all stored modifications
  for (const record of modifications) {
    if (record.type === 'deletion') {
      deletedNames.add(record.name);
    } else if (record.type === 'modification') {
      modifiedData.set(record.name, record.data);
    } else if (record.type === 'new') {
      newPresets.push(record.data);
    }
  }
  
  // Always load from presets.json - no import system needed
  if (factoryPresets.length === 0) {
    try {
      DEFAULT_PRESETS = await presetImporter.loadPresetsFromFile();
      factoryPresets = [...DEFAULT_PRESETS];
      totalFactoryPresetCount = DEFAULT_PRESETS.length;
      const tutorialCountEl = document.getElementById('tutorial-preset-count');
      if (tutorialCountEl) tutorialCountEl.textContent = totalFactoryPresetCount;
    } catch (e) {
      DEFAULT_PRESETS = [];
      factoryPresets = [];
    }
  }
  
  const basePresets = factoryPresets;
  hasImportedPresets = false; // All presets are always available

  // Apply modifications and filter deletions
  const mergedPresets = basePresets
    .filter(preset => !deletedNames.has(preset.name))
    .map(preset => {
      if (modifiedData.has(preset.name)) {
        return { ...preset, ...modifiedData.get(preset.name) };
      }
      return { ...preset };
    });

  // Add new user-created presets
  return [...mergedPresets, ...newPresets];
}

// Save visible presets to localStorage
function saveVisiblePresets() {
    visiblePresets = CAMERA_PRESETS.map(p => p.name);
}

// Get only visible presets
function getVisiblePresets() {
    return CAMERA_PRESETS;
}

// Save resolution setting
function saveResolution(index) {
  currentResolutionIndex = 0;
}

// ========== WHITE BALANCE FUNCTIONS - COMMENTED OUT ==========
// // Load white balance settings
// function loadWhiteBalanceSettings() {
//   const saved = localStorage.getItem(WHITE_BALANCE_STORAGE_KEY);
//   if (saved !== null) {
//     currentWhiteBalanceIndex = parseInt(saved);
//   }
// }

// // Save white balance settings
// function saveWhiteBalanceSettings() {
//   localStorage.setItem(WHITE_BALANCE_STORAGE_KEY, currentWhiteBalanceIndex.toString());
// }

// // Apply white balance filter
// function applyWhiteBalance() {
//   if (!video) return;
//   
//   // Small delay to ensure video is ready
//   setTimeout(() => {
//     const mode = WHITE_BALANCE_MODES[currentWhiteBalanceIndex];
//     
//     // Remove existing filter
//     video.style.filter = '';
//     
//     // Apply CSS filter based on mode
//     switch(mode.value) {
//       case 'daylight':
//         video.style.filter = 'brightness(1.05) saturate(1.1)';
//         break;
//       case 'cloudy':
//         video.style.filter = 'brightness(1.1) saturate(0.95) sepia(0.05)';
//         break;
//       case 'tungsten':
//         video.style.filter = 'brightness(0.95) saturate(1.15) hue-rotate(-10deg)';
//         break;
//       case 'fluorescent':
//         video.style.filter = 'brightness(1.02) saturate(1.05) hue-rotate(5deg)';
//         break;
//       case 'candlelight':
//         video.style.filter = 'brightness(0.85) saturate(1.3) sepia(0.15) hue-rotate(-15deg)';
//         break;
//       case 'moonlight':
//         video.style.filter = 'brightness(0.7) saturate(0.8) hue-rotate(15deg) contrast(1.1)';
//         break;
//       case 'auto':
//       default:
//         video.style.filter = '';
//         break;
//     }
//   }, 50);
// }

// function applyWhiteBalanceToCanvas(ctx, width, height) {
//   const mode = WHITE_BALANCE_MODES[currentWhiteBalanceIndex];
//   
//   if (mode.value === 'auto') {
//     return; // No adjustment needed
//   }
//   
//   // Get image data
//   const imageData = ctx.getImageData(0, 0, width, height);
//   const data = imageData.data;
//   
//   // Define adjustments for each mode
//   let brightness = 1.0;
//   let saturation = 1.0;
//   let warmth = 0; // Positive = warmer (red/yellow), Negative = cooler (blue)
//   let contrast = 1.0;
//   
//   switch(mode.value) {
//     case 'daylight':
//       brightness = 1.05;
//       saturation = 1.1;
//       warmth = 5;
//       break;
//     case 'cloudy':
//       brightness = 1.1;
//       saturation = 0.95;
//       warmth = 10;
//       break;
//     case 'tungsten':
//       brightness = 0.95;
//       saturation = 1.15;
//       warmth = -20;
//       break;
//     case 'fluorescent':
//       brightness = 1.02;
//       saturation = 1.05;
//       warmth = -10;
//       break;
//     case 'candlelight':
//       brightness = 0.85;
//       saturation = 1.3;
//       warmth = 25;
//       contrast = 0.95;
//       break;
//     case 'moonlight':
//       brightness = 0.7;
//       saturation = 0.8;
//       warmth = -15;
//       contrast = 1.1;
//       break;
//   }
//   
//   // Apply adjustments to each pixel
//   for (let i = 0; i < data.length; i += 4) {
//     let r = data[i];
//     let g = data[i + 1];
//     let b = data[i + 2];
//     
//     // Apply warmth (shift towards red/yellow or blue)
//     if (warmth > 0) {
//       r = Math.min(255, r + warmth);
//       g = Math.min(255, g + warmth * 0.5);
//     } else if (warmth < 0) {
//       b = Math.min(255, b - warmth);
//     }
//     
//     // Apply brightness
//     r *= brightness;
//     g *= brightness;
//     b *= brightness;
//     
//     // Apply saturation
//     const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
//     r = gray + saturation * (r - gray);
//     g = gray + saturation * (g - gray);
//     b = gray + saturation * (b - gray);
//     
//     // Apply contrast
//     r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
//     g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
//     b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
//     
//     // Clamp values
//     data[i] = Math.max(0, Math.min(255, r));
//     data[i + 1] = Math.max(0, Math.min(255, g));
//     data[i + 2] = Math.max(0, Math.min(255, b));
//   }
//   
//   // Put modified image data back
//   ctx.putImageData(imageData, 0, 0);
// }

// function showWhiteBalanceSubmenu() {
//   document.getElementById('settings-submenu').style.display = 'none';
//   
//   const submenu = document.getElementById('white-balance-submenu');
//   const list = document.getElementById('white-balance-list');
//   list.innerHTML = '';
//   
//   WHITE_BALANCE_MODES.forEach((mode, index) => {
//     const item = document.createElement('div');
//     item.className = 'resolution-item';
//     if (index === currentWhiteBalanceIndex) {
//       item.classList.add('active');
//     }
//     
//     const name = document.createElement('span');
//     name.className = 'resolution-name';
//     name.textContent = mode.name;
//     
//     item.appendChild(name);
//     
//     item.onclick = () => {
//       currentWhiteBalanceIndex = index;
//       saveWhiteBalanceSettings();
//       document.getElementById('current-white-balance-display').textContent = mode.name;
//       if (stream) {
//         applyWhiteBalance();
//       }
//       hideWhiteBalanceSubmenu();
//     };
//     
//     list.appendChild(item);
//   });
//   
//   submenu.style.display = 'flex';
// }

// function hideWhiteBalanceSubmenu() {
//   document.getElementById('white-balance-submenu').style.display = 'none';
//   document.getElementById('settings-submenu').style.display = 'flex';
// }
// ========== END WHITE BALANCE FUNCTIONS ==========

// Load resolution setting
function loadResolution() {
  currentResolutionIndex = 0;
}

function getStylesLists() {
    const regular = CAMERA_PRESETS.slice().sort((a, b) => a.name.localeCompare(b.name));
    return { favorites: [], regular };
}

function getFinalPrompt(preset, manualSelection) {
  if (manualSelection) return manualSelection;
  return (preset && preset.message) ? preset.message : '';
}

function getSortedPresets() {
    return CAMERA_PRESETS.slice().sort((a, b) => a.name.localeCompare(b.name));
}

// Save styles to localStorage
function saveStyles() {
  // LEGACY FUNCTION - kept for backward compatibility during migration period
  // New presets are saved to IndexedDB via presetStorage.saveNewPreset()
  // This function only exists to support old localStorage-based presets
  // and can be removed in a future version after migration period
  try {
    const customPresets = CAMERA_PRESETS.filter(p => p.internal === false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets));
  } catch (err) {
    console.error('Error saving styles:', err);
  }
}

function createStyleMenuItem(preset) {
    const originalIndex = CAMERA_PRESETS.findIndex(p => p === preset);
    
    const item = document.createElement('div');
    item.className = 'style-item';
    
    if (originalIndex === currentPresetIndex) {
        item.classList.add('active');
    }
    
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = preset.name;
    
    item.appendChild(name);
    
    item.onclick = () => {
        currentPresetIndex = originalIndex;
        notifyPresetChange();
        hideUnifiedMenu();
    };
    
    return item;
}

// Save favorite style
function saveFavoriteStyle(styleName) {
    favoriteStyles = [];
    try { localStorage.removeItem(FAVORITE_STYLES_KEY); } catch (err) {}
}

function loadLastUsedStyle() {
    const savedIndex = localStorage.getItem(LAST_USED_PRESET_KEY);
    
    if (savedIndex !== null) {
        try {
            const index = parseInt(savedIndex, 10);
            if (index >= 0 && index < CAMERA_PRESETS.length) {
                currentPresetIndex = index;
            }
        } catch (err) {
            console.error('Error loading last used style:', err);
        }
    }
}

// Check if style is favorited
function isFavoriteStyle(styleName) {
    return false;
}

// Get random preset index from favorites (or all presets if no favorites)
function getRandomPresetIndex() {
  const sortedPresets = getSortedPresets();
  
  if (sortedPresets.length === 0) return 0;

  const randomPreset = sortedPresets[Math.floor(Math.random() * sortedPresets.length)];
  return CAMERA_PRESETS.findIndex(p => p === randomPreset);
}

function showVisiblePresetsSubmenu() {
  visiblePresets = CAMERA_PRESETS.map(p => p.name);
  isVisiblePresetsSubmenuOpen = false;
  visiblePresetsScrollEnabled = false;
  isSettingsSubmenuOpen = false;
}

function hideVisiblePresetsSubmenu() {
  isVisiblePresetsSubmenuOpen = false;
  visiblePresetsScrollEnabled = false;
  currentVisiblePresetsIndex = 0;
}

// Called when user taps the viewer prompt text area
function handleViewerPromptTap() {
  // User-facing prompt and preset editing has been removed. Magic uses the
  // built-in prompt set internally and chooses from it automatically.
  notifyPresetChange();
}

// Show Preset Builder submenu
function showPresetBuilderSubmenu() {
  isMenuOpen = false;
  isSettingsSubmenuOpen = false;
  isPresetBuilderSubmenuOpen = false;
}

function hidePresetBuilderSubmenu() {
  isPresetBuilderSubmenuOpen = false;
  const savedBuilderIndex = editingPresetBuilderIndex;
  editingPresetBuilderIndex = -1;
  
  // Hide delete button when closing
  const deleteButton = document.getElementById('preset-builder-delete');
  if (deleteButton) deleteButton.style.display = 'none';
  
  // If we came from the gallery viewer, return there instead of settings
  if (returnToGalleryFromViewerEdit) {
    returnToGalleryFromViewerEdit = false;
    isSettingsSubmenuOpen = false;
    // Remember which preset was loaded before we open the viewer (openImageViewer blanks the field)
    const presetToRestore = window.viewerLoadedPreset;
    openImageViewer(currentViewerImageIndex);
    // Determine which preset to load into the viewer
    let presetToShow = null;
    if (presetToRestore) {
      // Editing existing — find by name first, fall back to saved index
      let updatedPreset = CAMERA_PRESETS.find(p => p.name === presetToRestore.name);
      if (!updatedPreset && savedBuilderIndex >= 0 && CAMERA_PRESETS[savedBuilderIndex]) {
        updatedPreset = CAMERA_PRESETS[savedBuilderIndex];
      }
      presetToShow = updatedPreset || presetToRestore;
    } else if (savedBuilderIndex >= 0 && CAMERA_PRESETS[savedBuilderIndex]) {
      // Edited existing preset with no prior loaded preset
      presetToShow = CAMERA_PRESETS[savedBuilderIndex];
    } else {
      // Brand new preset — it was just pushed to CAMERA_PRESETS, find it by internal:false at end
      const newPresets = CAMERA_PRESETS.filter(p => p.internal === false);
      if (newPresets.length > 0) presetToShow = newPresets[newPresets.length - 1];
    }
    if (presetToShow) {
      window.viewerLoadedPreset = presetToShow;
      let fullText = presetToShow.message || '';
      if (presetToShow.randomizeOptions) {
        if (presetToShow.optionGroups && presetToShow.optionGroups.length > 0) {
          presetToShow.optionGroups.forEach(group => {
            fullText += '\n\n' + group.title + ':\n';
            group.options.forEach((opt, i) => { fullText += '  ' + i + ': ' + opt.text + '\n'; });
          });
        } else if (presetToShow.options && presetToShow.options.length > 0) {
          fullText += '\n\nOPTIONS:\n';
          presetToShow.options.forEach((opt, i) => { fullText += '  ' + i + ': ' + opt.text + '\n'; });
        }
      }
      if (presetToShow.additionalInstructions && presetToShow.additionalInstructions.trim()) {
        fullText += '\n\n' + presetToShow.additionalInstructions;
      }
      const promptInput = document.getElementById('viewer-prompt');
      if (promptInput) promptInput.value = fullText;
      const presetHeader = document.getElementById('viewer-preset-header');
      if (presetHeader) presetHeader.textContent = presetToShow.name;
    }
    notifyPresetChange();
    return;
  }

  // If we came from the main menu + button, return to main menu
  if (returnToMainMenuFromBuilder) {
    returnToMainMenuFromBuilder = false;
    showUnifiedMenu();
    return;
  }
  
  isSettingsSubmenuOpen = false;
}

// ============================================================
// VIEWER PRESET OPTIONS (Gallery - Load Preset)
// ============================================================

// Show option fields in the gallery viewer when a preset with options is loaded
function showViewerPresetOptions(preset) {
  const container = document.getElementById('viewer-options-container');
  const singleDiv = document.getElementById('viewer-single-options');
  const multiDiv = document.getElementById('viewer-multi-options');
  
  if (!container) return;
  
  // Clear previous
  document.getElementById('viewer-single-options-list').innerHTML = '';
  document.getElementById('viewer-multi-options-groups').innerHTML = '';
  
  if (!preset.randomizeOptions) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  if (preset.optionGroups && preset.optionGroups.length > 0) {
    // Multi-selection
    singleDiv.style.display = 'none';
    multiDiv.style.display = 'block';
    const groupsContainer = document.getElementById('viewer-multi-options-groups');
    
    preset.optionGroups.forEach((group, groupIndex) => {
      const groupDiv = document.createElement('div');
      groupDiv.style.marginBottom = '10px';
      
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 11px; color: #aaa; margin-bottom: 6px;';
      label.textContent = group.title + ':';
      groupDiv.appendChild(label);
      
      group.options.forEach((opt, optIndex) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.groupIndex = groupIndex;
        btn.dataset.optIndex = optIndex;
        btn.textContent = opt.text;
        btn.style.cssText = 'display: block; width: 100%; text-align: left; padding: 8px 12px; margin-bottom: 4px; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 12px;';
        btn.addEventListener('click', () => {
          // Deselect others in same group
          groupDiv.querySelectorAll('button').forEach(b => {
            b.style.background = '#2a2a2a';
            b.style.borderColor = '#444';
            b.removeAttribute('data-selected');
          });
          btn.style.background = '#4CAF50';
          btn.style.borderColor = '#4CAF50';
          btn.setAttribute('data-selected', 'true');
        });
        groupDiv.appendChild(btn);
      });
      
      groupsContainer.appendChild(groupDiv);
    });
  } else if (preset.options && preset.options.length > 0) {
    // Single selection
    multiDiv.style.display = 'none';
    singleDiv.style.display = 'block';
    const listContainer = document.getElementById('viewer-single-options-list');
    
    preset.options.forEach((opt, optIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.optIndex = optIndex;
      btn.textContent = opt.text;
      btn.style.cssText = 'display: block; width: 100%; text-align: left; padding: 8px 12px; margin-bottom: 4px; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 12px;';
      btn.addEventListener('click', () => {
        // Deselect all others
        listContainer.querySelectorAll('button').forEach(b => {
          b.style.background = '#2a2a2a';
          b.style.borderColor = '#444';
          b.removeAttribute('data-selected');
        });
        btn.style.background = '#4CAF50';
        btn.style.borderColor = '#4CAF50';
        btn.setAttribute('data-selected', 'true');
      });
      listContainer.appendChild(btn);
    });
  } else {
    container.style.display = 'none';
  }
}

// Collect the viewer's selected options (returns manualSelection or null for random)
function collectViewerSelectedOptions(preset) {
  if (!preset || !preset.randomizeOptions) return null;
  
  if (preset.optionGroups && preset.optionGroups.length > 0) {
    const groupsContainer = document.getElementById('viewer-multi-options-groups');
    if (!groupsContainer) return null;
    const selections = [];
    const groupDivs = groupsContainer.children;
    let anySelected = false;
    
    for (let i = 0; i < groupDivs.length; i++) {
      const selectedBtn = groupDivs[i].querySelector('button[data-selected]');
      if (selectedBtn) {
        selections.push(parseInt(selectedBtn.dataset.optIndex));
        anySelected = true;
      } else {
        selections.push(null); // No selection for this group
      }
    }
    
    // If none selected, return null (will randomize)
    return anySelected ? selections.map(s => s === null ? 0 : s) : null;
    
  } else if (preset.options && preset.options.length > 0) {
    const listContainer = document.getElementById('viewer-single-options-list');
    if (!listContainer) return null;
    const selectedBtn = listContainer.querySelector('button[data-selected]');
    return selectedBtn ? parseInt(selectedBtn.dataset.optIndex) : null;
  }
  
  return null;
}

// ============================================================
// STYLE EDITOR OPTION MANAGEMENT
// ============================================================

let styleOptionCounter = 0;
let styleGroupCounter = 0;

function toggleStyleRandomizeOptions() {
  const checkbox = document.getElementById('style-randomize');
  const selectionTypeContainer = document.getElementById('style-selection-type-container');
  
  if (checkbox.checked) {
    selectionTypeContainer.style.display = 'block';
    updateStyleSelectionTypeVisibility();
  } else {
    selectionTypeContainer.style.display = 'none';
    document.getElementById('style-single-options-container').style.display = 'none';
    document.getElementById('style-multi-options-container').style.display = 'none';
  }
}

function updateStyleSelectionTypeVisibility() {
  const selectionType = document.getElementById('style-selection-type').value;
  if (selectionType === 'single') {
    document.getElementById('style-single-options-container').style.display = 'block';
    document.getElementById('style-multi-options-container').style.display = 'none';
  } else {
    document.getElementById('style-single-options-container').style.display = 'none';
    document.getElementById('style-multi-options-container').style.display = 'block';
  }
}

function addStyleSingleOption(text = '', enabled = true) {
  const list = document.getElementById('style-single-options-list');
  const div = document.createElement('div');
  div.className = 'option-item';
  div.style.cssText = 'display:flex; align-items:center; gap:0;';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.title = 'Include this option';
  checkbox.className = 'style-option-checkbox';
  checkbox.style.cssText = 'margin:0; padding:0; flex-shrink:0;';
  checkbox.dataset.role = 'option-enabled';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Option description';
  input.value = text;
  input.style.cssText = 'flex:1; min-width:0;';
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => div.remove();
  
  div.appendChild(checkbox);
  div.appendChild(input);
  div.appendChild(removeBtn);
  list.appendChild(div);
}

function addStyleOptionGroup(title = '', options = []) {
  const container = document.getElementById('style-multi-options-groups');
  const groupId = `style-group-${styleGroupCounter++}`;
  
  const groupDiv = document.createElement('div');
  groupDiv.className = 'option-group';
  groupDiv.dataset.groupId = groupId;
  
  const header = document.createElement('div');
  header.className = 'option-group-header';
  
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Group Title (e.g., "COLOR", "STYLE")';
  titleInput.value = title;
  titleInput.dataset.role = 'group-title';
  
  const removeGroupBtn = document.createElement('button');
  removeGroupBtn.textContent = 'Remove Group';
  removeGroupBtn.onclick = () => groupDiv.remove();
  
  header.appendChild(titleInput);
  header.appendChild(removeGroupBtn);
  groupDiv.appendChild(header);
  
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'option-group-options';
  optionsDiv.dataset.role = 'group-options';
  groupDiv.appendChild(optionsDiv);
  
  const addBtn = document.createElement('button');
  addBtn.className = 'add-group-option';
  addBtn.textContent = '+ Add Option to Group';
  addBtn.onclick = () => addStyleGroupOption(groupId);
  groupDiv.appendChild(addBtn);
  
  container.appendChild(groupDiv);
  
  if (options.length > 0) {
    options.forEach(opt => addStyleGroupOption(groupId, opt.text, opt.enabled !== false));
  } else {
    addStyleGroupOption(groupId);
  }
}

function addStyleGroupOption(groupId, text = '', enabled = true) {
  const group = document.querySelector(`[data-group-id="${groupId}"]`);
  if (!group) return;
  
  const optionsContainer = group.querySelector('[data-role="group-options"]');
  const div = document.createElement('div');
  div.className = 'option-item';
  div.style.cssText = 'display:flex; align-items:center; gap:0;';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled;
  checkbox.title = 'Include this option';
  checkbox.className = 'style-option-checkbox';
  checkbox.style.cssText = 'margin:0; padding:0; flex-shrink:0;';
  checkbox.dataset.role = 'option-enabled';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Option description';
  input.value = text;
  input.style.cssText = 'flex:1; min-width:0;';
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => div.remove();
  
  div.appendChild(checkbox);
  div.appendChild(input);
  div.appendChild(removeBtn);
  optionsContainer.appendChild(div);
}

function collectStyleSingleOptions() {
  const list = document.getElementById('style-single-options-list');
  const items = list.querySelectorAll('.option-item');
  const options = [];
  items.forEach((div, index) => {
    const input = div.querySelector('input[type="text"]');
    const checkbox = div.querySelector('input[type="checkbox"]');
    const text = input ? input.value.trim() : '';
    if (text) {
      options.push({ id: String(index + 1).padStart(3, '0'), text, enabled: checkbox ? checkbox.checked : true });
    }
  });
  return options;
}

function collectStyleOptionGroups() {
  const container = document.getElementById('style-multi-options-groups');
  const groups = container.querySelectorAll('.option-group');
  const optionGroups = [];
  groups.forEach(group => {
    const titleInput = group.querySelector('[data-role="group-title"]');
    const title = titleInput.value.trim().toUpperCase();
    if (!title) return;
    const optionDivs = group.querySelectorAll('[data-role="group-options"] .option-item');
    const options = [];
    optionDivs.forEach((div, index) => {
      const input = div.querySelector('input[type="text"]');
      const checkbox = div.querySelector('input[type="checkbox"]');
      const text = input ? input.value.trim() : '';
      if (text) options.push({ id: String(index + 1).padStart(3, '0'), text, enabled: checkbox ? checkbox.checked : true });
    });
    if (options.length > 0) optionGroups.push({ title, options });
  });
  return optionGroups;
}

function clearStyleEditorOptionFields() {
  const checkbox = document.getElementById('style-randomize');
  if (checkbox) checkbox.checked = false;
  const additional = document.getElementById('style-additional');
  if (additional) additional.value = '';
  const singleList = document.getElementById('style-single-options-list');
  if (singleList) singleList.innerHTML = '';
  const multiGroups = document.getElementById('style-multi-options-groups');
  if (multiGroups) multiGroups.innerHTML = '';
  const selTypeCont = document.getElementById('style-selection-type-container');
  if (selTypeCont) selTypeCont.style.display = 'none';
  const singleCont = document.getElementById('style-single-options-container');
  if (singleCont) singleCont.style.display = 'none';
  const multiCont = document.getElementById('style-multi-options-container');
  if (multiCont) multiCont.style.display = 'none';
  styleOptionCounter = 0;
  styleGroupCounter = 0;
}

// Toggle randomize options visibility
function toggleRandomizeOptions() {
  const randomizeCheckbox = document.getElementById('preset-builder-randomize');
  const selectionTypeContainer = document.getElementById('selection-type-container');
  const selectionType = document.getElementById('preset-builder-selection-type');
  
  if (randomizeCheckbox.checked) {
    selectionTypeContainer.style.display = 'block';
    updateSelectionTypeVisibility();
  } else {
    selectionTypeContainer.style.display = 'none';
    document.getElementById('single-options-container').style.display = 'none';
    document.getElementById('multi-options-container').style.display = 'none';
  }
}

// Update which option container is visible
function updateSelectionTypeVisibility() {
  const selectionType = document.getElementById('preset-builder-selection-type').value;
  const singleContainer = document.getElementById('single-options-container');
  const multiContainer = document.getElementById('multi-options-container');
  
  if (selectionType === 'single') {
    singleContainer.style.display = 'block';
    multiContainer.style.display = 'none';
  } else {
    singleContainer.style.display = 'none';
    multiContainer.style.display = 'block';
  }
}

// Add single option
function addSingleOption(text = '') {
  const list = document.getElementById('single-options-list');
  const id = `single-option-${singleOptionCounter++}`;
  
  const div = document.createElement('div');
  div.className = 'option-item';
  div.dataset.optionId = id;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Option description (e.g., "Red background with blue text")';
  input.value = text;
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => div.remove();
  
  div.appendChild(input);
  div.appendChild(removeBtn);
  list.appendChild(div);
}

// Add option group
function addOptionGroup(title = '', options = []) {
  const container = document.getElementById('multi-options-groups');
  const groupId = `option-group-${optionGroupCounter++}`;
  
  const groupDiv = document.createElement('div');
  groupDiv.className = 'option-group';
  groupDiv.dataset.groupId = groupId;
  
  // Group header
  const header = document.createElement('div');
  header.className = 'option-group-header';
  
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Group Title (e.g., "COLOR", "SIZE", "STYLE")';
  titleInput.value = title;
  titleInput.dataset.role = 'group-title';
  
  const removeGroupBtn = document.createElement('button');
  removeGroupBtn.textContent = 'Remove Group';
  removeGroupBtn.onclick = () => groupDiv.remove();
  
  header.appendChild(titleInput);
  header.appendChild(removeGroupBtn);
  groupDiv.appendChild(header);
  
  // Options container
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'option-group-options';
  optionsDiv.dataset.role = 'group-options';
  groupDiv.appendChild(optionsDiv);
  
  // Add option button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-group-option';
  addBtn.textContent = '+ Add Option to Group';
  addBtn.onclick = () => addGroupOption(groupId);
  groupDiv.appendChild(addBtn);
  
  container.appendChild(groupDiv);
  
  // Add initial options if provided
  if (options.length > 0) {
    options.forEach(opt => addGroupOption(groupId, opt.text));
  } else {
    // Add one empty option by default
    addGroupOption(groupId);
  }
}

// Add option to specific group
function addGroupOption(groupId, text = '') {
  const group = document.querySelector(`[data-group-id="${groupId}"]`);
  if (!group) return;
  
  const optionsContainer = group.querySelector('[data-role="group-options"]');
  
  const div = document.createElement('div');
  div.className = 'option-item';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Option description';
  input.value = text;
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => div.remove();
  
  div.appendChild(input);
  div.appendChild(removeBtn);
  optionsContainer.appendChild(div);
}

// Collect single options from UI
function collectSingleOptions() {
  const list = document.getElementById('single-options-list');
  const items = list.querySelectorAll('.option-item input');
  const options = [];
  
  items.forEach((input, index) => {
    const text = input.value.trim();
    if (text) {
      options.push({
        id: String(index + 1).padStart(3, '0'),
        text: text
      });
    }
  });
  
  return options;
}

// Collect option groups from UI
function collectOptionGroups() {
  const container = document.getElementById('multi-options-groups');
  const groups = container.querySelectorAll('.option-group');
  const optionGroups = [];
  
  groups.forEach(group => {
    const titleInput = group.querySelector('[data-role="group-title"]');
    const title = titleInput.value.trim().toUpperCase();
    
    if (!title) return; // Skip groups without title
    
    const optionInputs = group.querySelectorAll('[data-role="group-options"] .option-item input');
    const options = [];
    
    optionInputs.forEach((input, index) => {
      const text = input.value.trim();
      if (text) {
        options.push({
          id: String(index + 1).padStart(3, '0'),
          text: text
        });
      }
    });
    
    if (options.length > 0) {
      optionGroups.push({ title, options });
    }
  });
  
  return optionGroups;
}

// Clear Preset Builder form
function clearPresetBuilderForm() {
  editingPresetBuilderIndex = -1;
  document.getElementById('preset-builder-name').value = '';
  document.getElementById('preset-builder-category').value = '';
  document.getElementById('preset-builder-template').value = '';
  document.getElementById('preset-builder-prompt').value = '';
  
  // Show clear button and hide delete button when creating new preset
  const deleteButton = document.getElementById('preset-builder-delete');
  if (deleteButton) deleteButton.style.display = 'none';
  
  const clearButton = document.getElementById('preset-builder-clear');
  if (clearButton) clearButton.style.display = 'flex';

  // Close all chip sections when clearing
  document.querySelectorAll('.chip-section-content').forEach(c => {
    c.style.display = 'none';
  });
  document.querySelectorAll('.chip-section-header').forEach(h => {
    h.classList.remove('expanded');
  });
// Clear new fields
  document.getElementById('preset-builder-randomize').checked = false;
  document.getElementById('preset-builder-additional').value = '';
  document.getElementById('single-options-list').innerHTML = '';
  document.getElementById('multi-options-groups').innerHTML = '';
  document.getElementById('selection-type-container').style.display = 'none';
  document.getElementById('single-options-container').style.display = 'none';
  document.getElementById('multi-options-container').style.display = 'none';
  singleOptionCounter = 0;
  optionGroupCounter = 0;
}

// Edit preset in builder
function editPresetInBuilder(index) {
  const preset = CAMERA_PRESETS[index];
  
  // Show the submenu first
  showPresetBuilderSubmenu();
  
  // Set the editing index AFTER showing (which clears the form)
  editingPresetBuilderIndex = index;
  
 // Use setTimeout to ensure DOM is ready before populating
  setTimeout(() => {
    const nameInput = document.getElementById('preset-builder-name');
    const categoryInput = document.getElementById('preset-builder-category');
    const promptTextarea = document.getElementById('preset-builder-prompt');
    const templateSelect = document.getElementById('preset-builder-template');
    const deleteButton = document.getElementById('preset-builder-delete');
    const clearButton = document.getElementById('preset-builder-clear');
    
    if (nameInput) nameInput.value = preset.name;
    if (categoryInput) categoryInput.value = preset.category ? preset.category.join(', ') : '';
    if (promptTextarea) promptTextarea.value = preset.message || '';
    if (templateSelect) templateSelect.value = '';
    
    // Load additional instructions
    const additionalTextarea = document.getElementById('preset-builder-additional');
    if (additionalTextarea) {
      additionalTextarea.value = preset.additionalInstructions || '';
    }
    
    // Load randomize options and option data into UI
    const randomizeCheckboxLoad = document.getElementById('preset-builder-randomize');
    const selectionTypeLoad = document.getElementById('preset-builder-selection-type');
    
    // Clear existing option UI first
    document.getElementById('single-options-list').innerHTML = '';
    document.getElementById('multi-options-groups').innerHTML = '';
    singleOptionCounter = 0;
    optionGroupCounter = 0;
    
    if (randomizeCheckboxLoad) {
      randomizeCheckboxLoad.checked = preset.randomizeOptions || false;
      
      if (preset.randomizeOptions) {
        document.getElementById('selection-type-container').style.display = 'block';
        
        if (preset.optionGroups && preset.optionGroups.length > 0) {
          // Multi-selection
          selectionTypeLoad.value = 'multi';
          document.getElementById('single-options-container').style.display = 'none';
          document.getElementById('multi-options-container').style.display = 'block';
          preset.optionGroups.forEach(group => {
            addOptionGroup(group.title, group.options);
          });
        } else if (preset.options && preset.options.length > 0) {
          // Single selection
          selectionTypeLoad.value = 'single';
          document.getElementById('single-options-container').style.display = 'block';
          document.getElementById('multi-options-container').style.display = 'none';
          preset.options.forEach(opt => {
            addSingleOption(opt.text);
          });
        } else {
          document.getElementById('single-options-container').style.display = 'none';
          document.getElementById('multi-options-container').style.display = 'none';
        }
      } else {
        document.getElementById('selection-type-container').style.display = 'none';
        document.getElementById('single-options-container').style.display = 'none';
        document.getElementById('multi-options-container').style.display = 'none';
      }
    }
    
    // Show delete button and hide clear button when editing existing preset
    if (deleteButton) {
      deleteButton.style.display = 'flex';
    }
    if (clearButton) {
      clearButton.style.display = 'none';
    }
  }, 100);
}

// Handle template selection
function handleTemplateSelection() {
  const templateSelect = document.getElementById('preset-builder-template');
  const promptTextarea = document.getElementById('preset-builder-prompt');
  const selectedTemplate = templateSelect.value;
  
  if (selectedTemplate && PRESET_TEMPLATES[selectedTemplate] !== undefined) {
    promptTextarea.value = PRESET_TEMPLATES[selectedTemplate];
  }
}

// Get all unique categories from existing presets
function getAllCategories() {
  const categoriesSet = new Set();
  CAMERA_PRESETS.forEach(preset => {
    if (preset.category && Array.isArray(preset.category)) {
      preset.category.forEach(cat => {
        categoriesSet.add(cat.toUpperCase());
      });
    }
  });
  return Array.from(categoriesSet).sort();
}

// Save custom preset
async function saveCustomPreset() {
  const name = document.getElementById('preset-builder-name').value.trim();
  const categoryInput = document.getElementById('preset-builder-category').value.trim();
  const prompt = document.getElementById('preset-builder-prompt').value.trim();
  
  // Validation
  if (!name) {
    alert('Please enter a preset name');
    return;
  }
  
  if (!prompt) {
    alert('Please enter a prompt');
    return;
  }
  
// Parse categories
  const categories = categoryInput 
    ? categoryInput.split(',').map(cat => cat.trim().toUpperCase()).filter(cat => cat.length > 0)
    : ['CUSTOM'];
  
  // Store oldName BEFORE modifying for IndexedDB cleanup later
  let oldNameForDB = null;
  
  // Check if we're editing an existing preset
  if (editingPresetBuilderIndex >= 0) {
    // Editing mode
    const oldName = CAMERA_PRESETS[editingPresetBuilderIndex].name;
    oldNameForDB = oldName; // Store for IndexedDB cleanup
    
    // Collect options data
    const randomizeCheckbox = document.getElementById('preset-builder-randomize');
    const selectionType = document.getElementById('preset-builder-selection-type');
    const additionalInstructions = document.getElementById('preset-builder-additional').value.trim();
    
    const randomizeOptions = randomizeCheckbox.checked;
    let options = [];
    let optionGroups = [];
    
    if (randomizeOptions) {
      if (selectionType.value === 'single') {
        options = collectSingleOptions();
      } else {
        optionGroups = collectOptionGroups();
      }
    }
    
    CAMERA_PRESETS[editingPresetBuilderIndex] = {
      name: name.toUpperCase(),
      category: categories,
      message: prompt,
      options: options,
      optionGroups: optionGroups,
      randomizeOptions: randomizeOptions,
      additionalInstructions: additionalInstructions,
      internal: false
    };
    
    // If name changed, update visiblePresets array
    if (oldName !== name.toUpperCase()) {
      const visIndex = visiblePresets.indexOf(oldName);
      if (visIndex > -1) {
        visiblePresets[visIndex] = name.toUpperCase();
      }
    }
  } else {
    // Creating new preset - check if name already exists
    const existingIndex = CAMERA_PRESETS.findIndex(p => p.name.toUpperCase() === name.toUpperCase());
    if (existingIndex !== -1) {
      if (!await confirm(`A preset named "${name}" already exists. Do you want to overwrite it?`)) {
        return;
      }
      // Store old name for IndexedDB cleanup
      oldNameForDB = CAMERA_PRESETS[existingIndex].name;
      // Remove the existing preset
      CAMERA_PRESETS.splice(existingIndex, 1);
    }
    
    // Create new preset object
    // Collect options data
    const randomizeCheckbox = document.getElementById('preset-builder-randomize');
    const selectionType = document.getElementById('preset-builder-selection-type');
    const additionalInstructions = document.getElementById('preset-builder-additional').value.trim();
    
    const randomizeOptions = randomizeCheckbox.checked;
    let options = [];
    let optionGroups = [];
    
    if (randomizeOptions) {
      if (selectionType.value === 'single') {
        options = collectSingleOptions();
      } else {
        optionGroups = collectOptionGroups();
      }
    }
    
    const newPreset = {
      name: name.toUpperCase(),
      category: categories,
      message: prompt,
      options: options,
      optionGroups: optionGroups,
      randomizeOptions: randomizeOptions,
      additionalInstructions: additionalInstructions,
      internal: false
    };
    
    // Add to presets array
    CAMERA_PRESETS.push(newPreset);
    
    // Add to visible presets (always make new presets visible by default)
    if (!visiblePresets.includes(newPreset.name)) {
      visiblePresets.push(newPreset.name);
    }
  }
  
  // Save visible presets first
  saveVisiblePresets();
  
  // Save custom preset to IndexedDB
  const finalPreset = editingPresetBuilderIndex >= 0 
    ? CAMERA_PRESETS[editingPresetBuilderIndex]
    : CAMERA_PRESETS[CAMERA_PRESETS.length - 1];
  
  // If name changed from old name, delete old IndexedDB record first
  if (oldNameForDB && oldNameForDB !== finalPreset.name) {
    const transaction = presetStorage.db.transaction(['presets'], 'readwrite');
    const store = transaction.objectStore('presets');
    await store.delete(`new_${oldNameForDB}`);
  }
  
  // Save new/updated preset to IndexedDB
  await presetStorage.saveNewPreset(finalPreset);
  
  // Show success message
  alert(editingPresetBuilderIndex >= 0 ? `Preset "${name}" updated!` : `Preset "${name}" saved successfully!`);
  
  // Clear form and go back
  clearPresetBuilderForm();
  hidePresetBuilderSubmenu();
  
  // Refresh menu if it's open
  if (isMenuOpen) {
      }
}

// Delete custom preset from builder
async function deleteCustomPreset() {
  if (editingPresetBuilderIndex < 0) {
    alert('No preset selected for deletion');
    return;
  }
  
  const preset = CAMERA_PRESETS[editingPresetBuilderIndex];
  
  // Verify this is a user-created preset
  if (preset.internal !== false) {
    alert('Cannot delete built-in presets');
    return;
  }
  
  if (!await confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) {
    return;
  }
  
  // Remove from CAMERA_PRESETS
  CAMERA_PRESETS.splice(editingPresetBuilderIndex, 1);
  
  // Remove from visible presets
  const visIndex = visiblePresets.indexOf(preset.name);
  if (visIndex > -1) {
    visiblePresets.splice(visIndex, 1);
    saveVisiblePresets();
  }
  
  // Check if we deleted the currently active preset
  const wasCurrentPreset = (editingPresetBuilderIndex === currentPresetIndex);
  
  // Adjust current preset index if needed
  if (currentPresetIndex >= CAMERA_PRESETS.length) {
    currentPresetIndex = CAMERA_PRESETS.length - 1;
  }
  
  // If we deleted the current preset, switch to first visible preset
  if (wasCurrentPreset) {
    const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
    if (visiblePresetObjects.length > 0) {
      currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
    } else if (CAMERA_PRESETS.length > 0) {
      // No visible presets, just use first available
      currentPresetIndex = 0;
    }
  }

  // Always update the camera footer after deletion
  notifyPresetChange();

  // Clear viewer loaded preset and reset gallery header since the preset is gone
  window.viewerLoadedPreset = null;
  isGalleryLayerActive         = false;
  galleryLayerPresets          = [];
  const presetHeader = document.getElementById('viewer-preset-header');
  if (presetHeader) presetHeader.textContent = 'NO PRESET LOADED';
  
  // Remove from IndexedDB
  const transaction = presetStorage.db.transaction(['presets'], 'readwrite');
  const store = transaction.objectStore('presets');
  await store.delete(`new_${preset.name}`);
  
  // Also remove from old localStorage (legacy)
  saveStyles();
  
  // Update visible presets display to reflect deletion
  updateVisiblePresetsDisplay();
  
  alert(`Preset "${preset.name}" deleted successfully!`);
  
  // Clear form and go back
  clearPresetBuilderForm();
  hidePresetBuilderSubmenu();
  
  // Refresh menu if open
  if (isMenuOpen) {
      }
}

function populateVisiblePresetsList() {
  const list = document.getElementById('visible-presets-list');
  
  // Save current scroll position from the scroll container (like favorites does)
  const scrollContainer = document.querySelector('#visible-presets-submenu .submenu-list');
  const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
  
  list.innerHTML = '';
  
  // Only show presets that were explicitly imported or are user-created custom presets
// Do NOT show factory presets from JSON that weren't imported
const importedPresetNames = new Set(presetImporter.getImportedPresets().map(p => p.name));
const allPresets = CAMERA_PRESETS.filter(p => {
  if (p.internal) return false;  // Never show internal presets
  
  // Show if: explicitly imported OR user-created custom preset
  const isImported = importedPresetNames.has(p.name);
  const isCustom = !factoryPresets.some(fp => fp.name === p.name);
  
  return isImported || isCustom;
});
  const filtered = allPresets.filter(preset => {
    // First apply text search filter
    
    // Then apply category filter if active (filter by single category)
    
    return true;
  });
  
  const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  const fragment = document.createDocumentFragment();
  
  sorted.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'style-item';
    item.dataset.presetName = preset.name;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'master-prompt-checkbox';
    checkbox.checked = visiblePresets.includes(preset.name);
    checkbox.style.marginRight = '3vw';
    
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = preset.name;
    
    item.appendChild(checkbox);
    item.appendChild(name);
    
    checkbox.onclick = (e) => {
      e.stopPropagation();
      toggleVisiblePreset(preset.name, checkbox.checked);
    };
    
    item.onclick = () => {
      checkbox.checked = !checkbox.checked;
      toggleVisiblePreset(preset.name, checkbox.checked);
    };
    
    fragment.appendChild(item);
  });
  
  list.appendChild(fragment);
  
  const countElement = document.getElementById('visible-presets-count');
  if (countElement) {
    const visibleCount = sorted.filter(p => visiblePresets.includes(p.name)).length;
    countElement.textContent = visibleCount;
  }
  
// Update selection after render
  setTimeout(() => {
    updateVisiblePresetsSelection();
  }, 50);
}

function toggleVisiblePreset(presetName, isVisible) {
  const index = visiblePresets.indexOf(presetName);
  
  if (isVisible && index === -1) {
    visiblePresets.push(presetName);
  } else if (!isVisible && index > -1) {
    visiblePresets.splice(index, 1);
  }
  
  saveVisiblePresets();
  updateVisiblePresetsDisplay();
  
  // Check if the currently active preset was just made invisible
  const currentPreset = CAMERA_PRESETS[currentPresetIndex];
  if (currentPreset && !isVisible && currentPreset.name === presetName) {
    // Current preset was made invisible - switch to first visible preset
    const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
    if (visiblePresetObjects.length > 0) {
      // Find index of first visible preset in CAMERA_PRESETS
      currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
      // Update the camera footer immediately
      notifyPresetChange();
    }
  }
  
// Save scroll position before repopulating (like favorites does)
  const scrollContainer = document.querySelector('#visible-presets-submenu .submenu-list');
  const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
  
  populateVisiblePresetsList(); // Update the current submenu list
  
  // Restore scroll position after repopulating - use requestAnimationFrame to ensure DOM is updated
  if (scrollContainer) {
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollPosition;
    });
  }
  
  // Always update main menu count (even if not open)
  const stylesCountElement = document.getElementById('styles-count');
  if (stylesCountElement) {
    const { favorites, regular } = getStylesLists();
    const totalVisible = favorites.length + regular.length;
    stylesCountElement.textContent = totalVisible;
  }
  
  // Refresh main menu if open
  if (isMenuOpen) {
      }
}

function updateVisiblePresetsDisplay() {
  const display = document.getElementById('current-visible-presets-display');
  if (display) {
    const total = CAMERA_PRESETS.filter(p => !p.internal).length;
    const visible = visiblePresets.length;
    display.textContent = visible === total ? 'All Visible' : `${visible} of ${total}`;
  }
}

function scrollVisiblePresetsUp() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;
  
  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentVisiblePresetsIndex = Math.max(0, currentVisiblePresetsIndex - 1);
  updateVisiblePresetsSelection();
}

function scrollVisiblePresetsDown() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;
  
  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentVisiblePresetsIndex = Math.min(items.length - 1, currentVisiblePresetsIndex + 1);
  updateVisiblePresetsSelection();
}

function updateVisiblePresetsSelection() {
  if (!isVisiblePresetsSubmenuOpen) return;

  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  currentVisiblePresetsIndex = Math.max(0, Math.min(currentVisiblePresetsIndex, items.length - 1));

  const currentItem = items[currentVisiblePresetsIndex];
  if (currentItem) {
    currentItem.classList.add('menu-selected');
    
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
    
    // Show category hint with individually clickable categories
    const presetName = currentItem.dataset.presetName;
    const preset = CAMERA_PRESETS.find(p => p.name === presetName);
  }
}

function selectCurrentVisiblePresetsItem() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;

  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0 || currentVisiblePresetsIndex >= items.length) return;

  const currentItem = items[currentVisiblePresetsIndex];
  if (currentItem) {
    currentItem.click();
  }
}

function toggleNoMagicMode() {
  noMagicMode = false;
  notifyPresetChange();
}

function updateNoMagicModeStatus() {
  const statusElement = document.getElementById('no-magic-status');
  if (statusElement) {
    statusElement.textContent = noMagicMode ? 'Enabled' : 'Disabled';
  }
}

function loadNoMagicMode() {
  noMagicMode = false;
  try {
    localStorage.removeItem('r1_camera_no_magic_mode');
  } catch (err) {}
  updateNoMagicModeStatus();
}

// 
// LAYER PRESET SYSTEM
// Combines multiple presets into ONE merged prompt sent as a single AI request.
// 

// Build the combined layered prompt from an ordered array of presets.
// layerPresets[0] = PRIMARY, layerPresets[1..n] = additional layers.

function buildCombinedLayerPrompt(layerPresets) {
  if (!layerPresets || layerPresets.length === 0) return '';

  const primaryPreset  = layerPresets[0];
  const additionalPresets = layerPresets.slice(1);

  // Helper: strips opening "Take a picture and/of/in/that" so layers
  // read as style modifiers rather than new photo requests
  function stripPhotoOpener(text) {
    if (!text) return '';
    return text
      .replace(/^Take a picture of the subject and /i, '')
      .replace(/^Take a picture of the subject, /i, '')
      .replace(/^Take a picture of the subject /i, '')
      .replace(/^Take a picture and /i, '')
      .replace(/^Take a picture of /i, '')
      .replace(/^Take a picture in /i, '')
      .replace(/^Take a picture that /i, '')
      .replace(/^Take a picture\./i, '')
      .replace(/^Take a picture /i, '')
      .trim();
  }

  // 1. Start with the primary message
  let finalPrompt = primaryPreset.message || '';

  // 2. Single-image reminder after the primary message
  finalPrompt += '\n\nPlease apply all style instructions to the same single image.';

  // 3. Primary preset options — manual selection if available, otherwise random
  if (primaryPreset.randomizeOptions) {
    if (primaryPreset.randomizeOptions) {
      finalPrompt += '\n\n' + buildRandomOptionsText(primaryPreset);
    }
  }

  // 4. Additional transformation layers — strip photo opener so AI
  //    reads these as style modifiers, not new photo requests
  if (additionalPresets.length > 0) {
    finalPrompt += '\n\n--- ADDITIONAL TRANSFORMATION LAYERS ---\n';
    finalPrompt += '(Apply all of the following as style modifiers to the same single image)\n';
    additionalPresets.forEach((preset, index) => {
      const layerText = stripPhotoOpener(preset.message || '');
      finalPrompt += `\nLayer ${index + 1}:\n${layerText}\n`;
      if (preset.randomizeOptions) {
        finalPrompt += buildRandomOptionsText(preset) + '\n';
      }
    });
  }

  // 5. Final instructions (primary first, then each layer)
  finalPrompt += '\n\n--- FINAL INSTRUCTIONS ---\n';
  if (primaryPreset.additionalInstructions && primaryPreset.additionalInstructions.trim()) {
    finalPrompt += primaryPreset.additionalInstructions + '\n';
  }
  additionalPresets.forEach(preset => {
    if (preset.additionalInstructions && preset.additionalInstructions.trim()) {
      finalPrompt += preset.additionalInstructions + '\n';
    }
  });

  // 6. Master prompt override (if enabled)
  if (masterPromptEnabled && masterPromptText.trim()) {
    finalPrompt += `\n\nOVERRIDE INSTRUCTIONS (these take priority over everything above - apply exactly as specified):\n${masterPromptText}`;
  }

  // 7. Aspect ratio
  if (selectedAspectRatio === '1:1') {
    finalPrompt += '\n\nUse a square aspect ratio.';
  } else if (selectedAspectRatio === '16:9') {
    finalPrompt += '\n\nUse a square aspect ratio, but pad the image with black bars at top and bottom to simulate a 16:9 aspect ratio.';
  }

  console.log('COMBINED LAYER PROMPT:', finalPrompt);
  return finalPrompt;
}

// Update the visual highlight in the preset list when in Layer mode.
// PRIMARY = purple badge, Layers = grey numbered badges.

function updateLayerPresetList() {
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;
  const items = presetList.querySelectorAll('.preset-item');

  items.forEach(item => {
    const presetName = item.querySelector('.preset-name').textContent;
    const selectedIndex = layerSelectedPresets.findIndex(p => p.name === presetName);

    // Remove old badges
    const oldBadge = item.querySelector('.layer-badge');
    if (oldBadge) oldBadge.remove();

    if (selectedIndex !== -1) {
      // Highlight selected
      item.style.background = selectedIndex === 0 ? 'rgba(156,39,176,0.25)' : 'rgba(85,85,85,0.35)';
      item.style.border = selectedIndex === 0 ? '2px solid #9c27b0' : '2px solid #888';

      // Add order badge
      const badge = document.createElement('span');
      badge.className = selectedIndex === 0 ? 'layer-badge layer-badge-primary' : 'layer-badge layer-badge-layer';
      badge.textContent = selectedIndex === 0 ? 'PRIMARY' : `Layer ${selectedIndex}`;
      item.querySelector('.preset-name').appendChild(badge);
    } else {
      item.style.background = '';
      item.style.border = '';
    }
  });

  const countSpan = document.getElementById('layer-preset-count');
  if (countSpan) {
    const label = layerSelectedPresets.length === 0
      ? '(0 selected)'
      : `(${layerSelectedPresets.length} selected — 1st = PRIMARY)`;
    countSpan.textContent = label;
  }
}

// CAMERA LAYER

// Opens the preset selector in Layer mode from the camera carousel button.

function openCameraLayerPresetSelector() {
  if (noMagicMode) {
        setTimeout(() => notifyPresetChange(), 2000);
    return;
  }
  if (isRandomMode) {
        setTimeout(() => notifyPresetChange(), 2000);
    return;
  }

  isLayerPresetMode   = true;
  galleryLayerImageId = null; // camera context, not gallery
  layerSelectedPresets = [...cameraLayerPresets]; // pre-fill with existing selections

  const modal  = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.innerHTML = 'Select Layer Presets (max 5) <span id="layer-preset-count" style="font-size:12px;color:#aaa;">(0 selected — 1st = PRIMARY)</span>';

  // Inject controls bar (or reuse)
  let layerControls = document.getElementById('layer-preset-controls');
  if (!layerControls) {
    layerControls = document.createElement('div');
    layerControls.id = 'layer-preset-controls';
    layerControls.style.cssText = 'padding:0 8px;background:#1a1a1a;border-bottom:1px solid #444;display:flex;gap:8px;justify-content:space-between;align-items:stretch;';
    layerControls.innerHTML = `
      <button id="layer-preset-apply"  class="batch-control-button" style="background:#9c27b0;color:#fff;">Apply Selected</button>
      <button id="layer-preset-cancel" class="batch-control-button">Cancel</button>
    `;
    const filterRow    = presetFilter.closest('.filter-row') || presetFilter.parentNode;
    filterRow.parentNode.insertBefore(layerControls, filterRow);
  }
  layerControls.style.display = 'flex';

  // Hide multi-preset controls if visible
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) multiControls.style.display = 'none';

  populatePresetList();
  updateLayerPresetList();
  modal.style.display   = 'flex';
  isPresetSelectorOpen  = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();

  document.getElementById('layer-preset-apply').onclick  = applyCameraLayerPresets;
  document.getElementById('layer-preset-cancel').onclick = cancelLayerPresetSelector;
}

function cancelLayerPresetSelector() {
  isLayerPresetMode    = false;
  layerSelectedPresets = [];
  const layerControls  = document.getElementById('layer-preset-controls');
  if (layerControls) layerControls.style.display = 'none';
  const header = document.querySelector('.preset-selector-header h3');
  if (header) header.textContent = 'Select Preset';
  hidePresetSelector();
}

async function applyCameraLayerPresets() {
  if (layerSelectedPresets.length === 0) {
    alert('Please select at least one preset. The first preset you tap becomes the PRIMARY.');
    return;
  }

  cameraLayerPresets  = [...layerSelectedPresets];
  isCameraLayerActive = true;
  isLayerPresetMode   = false;
  layerSelectedPresets = [];

  const layerControls = document.getElementById('layer-preset-controls');
  if (layerControls) layerControls.style.display = 'none';
  const header = document.querySelector('.preset-selector-header h3');
  if (header) header.textContent = 'Select Preset';
  hidePresetSelector();

  // Highlight the carousel button purple
  const btn = document.getElementById('camera-layer-toggle');
  if (btn) btn.classList.add('layer-active');


  // Save to localStorage so it survives a page refresh
  saveCameraLayerPresets();
  notifyPresetChange();
}

// Persist layer selections across refreshes
function saveCameraLayerPresets() {
  try {
    localStorage.setItem(CAMERA_LAYER_PRESET_KEY, JSON.stringify(cameraLayerPresets.map(p => p.name)));
  } catch (err) {
    console.error('Failed to save camera layer presets:', err);
  }
}

// Clear layer mode entirely
function clearCameraLayerPresets() {
  cameraLayerPresets  = [];
  isCameraLayerActive = false;
  try { localStorage.removeItem(CAMERA_LAYER_PRESET_KEY); } catch (err) {}
  const btn = document.getElementById('camera-layer-toggle');
  if (btn) btn.classList.remove('layer-active');
  notifyPresetChange();
}

// Clears gallery layer state and resets the header indicator.
// Called whenever the user picks a new preset, edits a prompt, or selects multi.

function clearGalleryLayerState() {
  if (!isGalleryLayerActive) return; // nothing to clear
  isGalleryLayerActive         = false;
  galleryLayerPresets          = [];
}

// GALLERY LAYER 

// Opens the preset selector in Layer mode from the gallery image viewer.

function openGalleryLayerPresetSelector(imageId) {
  galleryLayerImageId  = imageId;
  isLayerPresetMode    = true;
  layerSelectedPresets = [];

  const modal  = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.innerHTML = 'Select Layer Presets (max 5) <span id="layer-preset-count" style="font-size:12px;color:#aaa;">(0 selected — 1st = PRIMARY)</span>';

  let layerControls = document.getElementById('layer-preset-controls');
  if (!layerControls) {
    layerControls = document.createElement('div');
    layerControls.id = 'layer-preset-controls';
    layerControls.style.cssText = 'padding:0 8px;background:#1a1a1a;border-bottom:1px solid #444;display:flex;gap:8px;justify-content:space-between;align-items:stretch;';
    layerControls.innerHTML = `
      <button id="layer-preset-apply"  class="batch-control-button" style="background:#9c27b0;color:#fff;">Apply Selected</button>
      <button id="layer-preset-cancel" class="batch-control-button">Cancel</button>
    `;
    const filterRow    = presetFilter.closest('.filter-row') || presetFilter.parentNode;
    filterRow.parentNode.insertBefore(layerControls, filterRow);
  }
  layerControls.style.display = 'flex';

  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) multiControls.style.display = 'none';

  populatePresetList();
  updateLayerPresetList();
  modal.style.display   = 'flex';
  isPresetSelectorOpen  = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();

  document.getElementById('layer-preset-apply').onclick  = applyGalleryLayerPresets;
  document.getElementById('layer-preset-cancel').onclick = cancelLayerPresetSelector;
}

// Sends the combined layered prompt + selected gallery image to the Rabbit servers.
async function applyGalleryLayerPresets() {
  if (layerSelectedPresets.length === 0) {
    alert('Please select at least one preset. The first preset you tap becomes the PRIMARY.');
    return;
  }
  if (!galleryLayerImageId) {
    alert('No image selected.');
    return;
  }

  const image = galleryImages.find(img => img.id === galleryLayerImageId);
  if (!image) {
    alert('Image not found in gallery.');
    return;
  }

  const presetsToApply = [...layerSelectedPresets];

  // Save selections so they persist while the viewer is open
  galleryLayerPresets          = [...presetsToApply];
  isGalleryLayerActive         = true;

  // Clean up selector UI
  isLayerPresetMode    = false;
  layerSelectedPresets = [];
  galleryLayerImageId  = null;
  const layerControls  = document.getElementById('layer-preset-controls');
  if (layerControls) layerControls.style.display = 'none';
  const header = document.querySelector('.preset-selector-header h3');
  if (header) header.textContent = 'Select Preset';
  hidePresetSelector();


  // Build ONE combined prompt from all selected layers
  const combinedPrompt = buildCombinedLayerPrompt(presetsToApply);

  const resizedImageBase64 = await resizeImageForSubmission(image.imageBase64);

  if (typeof PluginMessageHandler !== 'undefined') {
    const layerPayload = {
      pluginId: 'com.r1.pixelart',
      imageBase64: resizedImageBase64
    };
    if (combinedPrompt && combinedPrompt.trim()) {
      layerPayload.message = combinedPrompt;
    }
    PluginMessageHandler.postMessage(JSON.stringify(layerPayload));
    // Update the viewer header to show LAYER is active

    const presetHeader = document.getElementById('viewer-preset-header');
    if (presetHeader) presetHeader.textContent = '📑 LAYER';

    alert(`Layer preset applied! ${presetsToApply.length} preset${presetsToApply.length > 1 ? 's' : ''} merged into one transform.`);
  } else {
    alert('Layer prompt built:\n\n' + combinedPrompt.substring(0, 200) + '...');
  }
}

// END LAYER PRESET SYSTEM

// Save camera multi-preset state to localStorage
function saveCameraMultiPresets() {
  try {
    localStorage.setItem(CAMERA_MULTI_PRESET_KEY, JSON.stringify(cameraSelectedPresets.map(p => p.name)));
  } catch (err) {
    console.error('Failed to save camera multi presets:', err);
  }
}

// Clear camera multi-preset state
function clearCameraMultiPresets() {
  cameraSelectedPresets = [];
  isCameraMultiPresetActive = false;
  try {
    localStorage.removeItem(CAMERA_MULTI_PRESET_KEY);
  } catch (err) {}
  const btn = document.getElementById('camera-multi-preset-toggle');
  if (btn) btn.classList.remove('camera-multi-active');
  notifyPresetChange();
}

// Load import resolution setting
function loadImportResolution() {
  currentImportResolutionIndex = 0;
  updateImportResolutionDisplay();
}

// Save import resolution setting
function saveImportResolution() {
  currentImportResolutionIndex = 0;
  updateImportResolutionDisplay();
}

// Update import resolution display
function updateImportResolutionDisplay() {
  const display = document.getElementById('current-import-resolution-display');
  if (display) {
    const res = IMPORT_RESOLUTION_OPTIONS[currentImportResolutionIndex];
    display.textContent = res.name.split(' ')[0];
  }
}

function showTutorialSubmenu() {
  isTutorialOpen = false;
  tutorialScrollEnabled = false;
  isTutorialSubmenuOpen = false;
  isSettingsSubmenuOpen = false;
}

function hideTutorialSubmenu() {
  isTutorialOpen = false;
  tutorialScrollEnabled = false;
  isTutorialSubmenuOpen = false;
}

function showTutorialSection(sectionId) {
  const glossary = document.getElementById('tutorial-glossary');
  const contentArea = document.getElementById('tutorial-content-area');
  const targetSection = document.getElementById('section-' + sectionId);
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  
  if (glossary && contentArea && targetSection) {
    glossary.style.display = 'none';
    contentArea.style.display = 'flex';
    
    // Show back to menu button
    if (backToGlossaryBtn) {
      backToGlossaryBtn.style.display = 'block';
    }
    
    tutorialScrollEnabled = true; // Enable scrolling when viewing content
    
    // Scroll to the target section
    setTimeout(() => {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ===== TUTORIAL SEARCH =====

let tutorialSearchResults = [];
let tutorialSearchIndex = 0;
let tutorialSearchOriginalHTML = null;

function tutorialSearchRun() {
  const input = document.getElementById('tutorial-search-input');
  const status = document.getElementById('tutorial-search-status');
  const contentArea = document.getElementById('tutorial-content-area');
  if (!input || !contentArea) return;

  const query = input.value.trim();

  // Restore original HTML first (remove any previous highlights)
  const tutorialContent = contentArea.querySelector('.tutorial-content');
  if (tutorialSearchOriginalHTML !== null) {
    tutorialContent.innerHTML = tutorialSearchOriginalHTML;
  }

  tutorialSearchResults = [];
  tutorialSearchIndex = 0;

  if (!query) {
    if (status) status.textContent = '';
    tutorialSearchOriginalHTML = null;
    return;
  }

  // Save clean HTML before highlighting
  tutorialSearchOriginalHTML = tutorialContent.innerHTML;

  // Split into individual words, remove empty strings — OR search
  const words = query.split(/\s+/).filter(w => w.length > 0);

  // Build a single regex that matches ANY of the words (OR logic)
  const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('(' + escapedWords.join('|') + ')', 'gi');

  // Walk all text nodes and collect ones that match at least one word
  const walker = document.createTreeWalker(tutorialContent, NodeFilter.SHOW_TEXT, null);
  const matchNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (re.test(node.textContent)) {
      matchNodes.push(node);
    }
    re.lastIndex = 0; // reset stateful regex after each test
  }

  // Highlight all matches in each matching text node
  matchNodes.forEach(textNode => {
    const parent = textNode.parentNode;
    if (!parent) return;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    const parts = textNode.textContent.split(re);
    parts.forEach(part => {
      if (re.test(part)) {
        const mark = document.createElement('mark');
        mark.className = 'tutorial-search-match';
        mark.style.cssText = 'background:#FE5F00;color:#000;border-radius:2px;padding:0 1px;';
        mark.textContent = part;
        frag.appendChild(mark);
        tutorialSearchResults.push(mark);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
      re.lastIndex = 0;
    });
    parent.replaceChild(frag, textNode);
  });

  if (status) {
    status.textContent = tutorialSearchResults.length > 0
      ? `${tutorialSearchResults.length} result${tutorialSearchResults.length !== 1 ? 's' : ''} found`
      : 'No results found';
  }

  if (tutorialSearchResults.length > 0) {
    tutorialSearchIndex = 0;
    tutorialSearchScrollTo(0);
  }
}

function tutorialSearchScrollTo(index) {
  const status = document.getElementById('tutorial-search-status');
  tutorialSearchResults.forEach((el, i) => {
    el.style.background = i === index ? '#fff200' : '#FE5F00';
    el.style.color = '#000';
  });
  if (tutorialSearchResults[index]) {
    tutorialSearchResults[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (status && tutorialSearchResults.length > 0) {
    status.textContent = `Result ${index + 1} of ${tutorialSearchResults.length}`;
  }
}

function tutorialSearchNext() {
  if (tutorialSearchResults.length === 0) return;
  tutorialSearchIndex = (tutorialSearchIndex + 1) % tutorialSearchResults.length;
  tutorialSearchScrollTo(tutorialSearchIndex);
}

function tutorialSearchPrev() {
  if (tutorialSearchResults.length === 0) return;
  tutorialSearchIndex = (tutorialSearchIndex - 1 + tutorialSearchResults.length) % tutorialSearchResults.length;
  tutorialSearchScrollTo(tutorialSearchIndex);
}

function tutorialSearchClear() {
  const input = document.getElementById('tutorial-search-input');
  const status = document.getElementById('tutorial-search-status');
  const contentArea = document.getElementById('tutorial-content-area');
  if (input) input.value = '';
  if (status) status.textContent = '';
  if (tutorialSearchOriginalHTML !== null && contentArea) {
    const tutorialContent = contentArea.querySelector('.tutorial-content');
    if (tutorialContent) tutorialContent.innerHTML = tutorialSearchOriginalHTML;
    tutorialSearchOriginalHTML = null;
  }
  tutorialSearchResults = [];
  tutorialSearchIndex = 0;
}
// ===== END TUTORIAL SEARCH =====

function showTutorialGlossary() {
  const glossary = document.getElementById('tutorial-glossary');
  const contentArea = document.getElementById('tutorial-content-area');
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  
  if (glossary && contentArea) {
    contentArea.style.display = 'none';
    glossary.style.display = 'block';
    
    // Hide back to menu button when on glossary
    if (backToGlossaryBtn) {
      backToGlossaryBtn.style.display = 'none';
    }
    
    tutorialScrollEnabled = true;
    currentTutorialGlossaryIndex = 0;
    
    // Update selection after render
    setTimeout(() => {
      updateTutorialGlossarySelection();
    }, 50);
  }
}

function scrollTutorialUp() {
  if (!isTutorialSubmenuOpen) return;
  
  // Check if glossary is visible
  const glossary = document.getElementById('tutorial-glossary');
  if (glossary && glossary.style.display !== 'none') {
    const items = glossary.querySelectorAll('.glossary-item');
    if (items.length === 0) return;
    
    currentTutorialGlossaryIndex = (currentTutorialGlossaryIndex - 1 + items.length) % items.length;
    updateTutorialGlossarySelection();
    return;
  }
  
  // Otherwise scroll tutorial content
  const contentArea = document.getElementById('tutorial-content-area');
  if (!contentArea || contentArea.style.display !== 'flex') return;
  
  const tutorialContent = contentArea.querySelector('.submenu-list.tutorial-content');
  if (tutorialContent) {
    tutorialContent.scrollTop = Math.max(0, tutorialContent.scrollTop - 80);
  }
}

function scrollTutorialDown() {
  if (!isTutorialSubmenuOpen) return;
  
  // Check if glossary is visible
  const glossary = document.getElementById('tutorial-glossary');
  if (glossary && glossary.style.display !== 'none') {
    const items = glossary.querySelectorAll('.glossary-item');
    if (items.length === 0) return;
    
    currentTutorialGlossaryIndex = (currentTutorialGlossaryIndex + 1) % items.length;
    updateTutorialGlossarySelection();
    return;
  }
  
  // Otherwise scroll tutorial content
  const contentArea = document.getElementById('tutorial-content-area');
  if (!contentArea || contentArea.style.display !== 'flex') return;
  
  const tutorialContent = contentArea.querySelector('.submenu-list.tutorial-content');
  if (tutorialContent) {
    tutorialContent.scrollTop = Math.min(tutorialContent.scrollHeight - tutorialContent.clientHeight, tutorialContent.scrollTop + 80);
  }
}

function updateTutorialGlossarySelection() {
  const glossary = document.getElementById('tutorial-glossary');
  if (!glossary) return;

  const items = glossary.querySelectorAll('.glossary-item');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  // Add selection to current item
  if (currentTutorialGlossaryIndex >= 0 && currentTutorialGlossaryIndex < items.length) {
    const currentItem = items[currentTutorialGlossaryIndex];
    currentItem.classList.add('menu-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Guided tour removed
let tourActive = false;
function startGuidedTour() {}
function endGuidedTour() { tourActive = false; }
function tourNext() {}
function tourBack() {}

// Show import resolution submenu
function showImportResolutionSubmenu() {
  currentImportResolutionIndex = 0;
  isImportResolutionSubmenuOpen = false;
  currentImportResolutionIndex_Menu = 0;
}

// Hide import resolution submenu
function hideImportResolutionSubmenu() {
  isImportResolutionSubmenuOpen = false;
}

// Toggle random mode
function toggleRandomMode() {
  isRandomMode = !isRandomMode;
  
  const randomToggle = document.getElementById('random-toggle');
  if (isRandomMode) {
    randomToggle.classList.add('random-active');
    showStyleReveal('🎲 Random Mode');
  } else {
    randomToggle.classList.remove('random-active');
    notifyPresetChange();
    // Show current preset when random mode is turned off
    if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
      showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
    }
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'random_mode_toggled',
      enabled: isRandomMode,
      timestamp: Date.now() 
    }));
  }
}

// Load queued photos from localStorage
function loadQueue() {
  try {
    const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (saved) {
      photoQueue = JSON.parse(saved);
    }
  } catch (err) {
    console.error('Error loading queue:', err);
    photoQueue = [];
  }
}

// Save queue to localStorage
function saveQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(photoQueue));
  } catch (err) {
    console.error('Error saving queue:', err);
  }
}

// Update connection status display
function updateConnectionStatus() {
  if (connectionStatusElement) {
    if (isOnline) {
      connectionStatusElement.className = 'connection-status online';
      connectionStatusElement.querySelector('#connection-text').textContent = 'Online';
    } else {
      connectionStatusElement.className = 'connection-status offline';
      connectionStatusElement.querySelector('#connection-text').textContent = 'Offline';
    }
    // connectionStatusElement.style.display = 'block'; // not auto-showing only shown on init
  }
  
  updateQueueDisplay();
}

// Update queue count display
function updateQueueDisplay() {
  if (queueStatusElement) {
    const count = photoQueue.length;
    queueStatusElement.querySelector('#queue-count').textContent = count;
    queueStatusElement.style.display = count > 0 ? 'block' : 'none';
  }
  
  if (syncButton) {
    const count = photoQueue.length;
    syncButton.querySelector('#sync-count').textContent = count;
    syncButton.style.display = count > 0 && isOnline ? 'block' : 'none';
  }
}

// Setup connection monitoring
function setupConnectionMonitoring() {
  window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    console.log('Connection restored');
    
    if (photoQueue.length > 0 && !isSyncing) {
      setTimeout(() => {
                syncQueuedPhotos();
      }, 1000);
    }
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
    console.log('Connection lost');
    
    if (isSyncing) {
          }
  });
  
  updateConnectionStatus();
}

// Enumerate available cameras
async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(device => device.kind === 'videoinput');
    console.log('Available cameras:', availableCameras.length);
    return availableCameras;
  } catch (err) {
    console.error('Error enumerating cameras:', err);
    return [];
  }
}

// Get camera constraints for current camera
function getCameraConstraints() {
  const resolution = RESOLUTION_PRESETS[currentResolutionIndex];
  
  if (availableCameras.length === 0) {
    return {
      video: {
        facingMode: 'environment',
        width: { exact: resolution.width },
        height: { exact: resolution.height },
        frameRate: { ideal: 30, max: 30 }
      }
    };
  }

  const currentCamera = availableCameras[currentCameraIndex];
  const constraints = {
    video: {
      deviceId: { exact: currentCamera.deviceId },
      width: { exact: resolution.width },
      height: { exact: resolution.height },
      frameRate: { ideal: 30, max: 30 }
    }
  };
  
  if (isFrontCamera()) {
    constraints.video.advanced = [{ zoom: 1.0 }];
  }
  
  return constraints;
}

// Change resolution and restart camera
async function changeResolution(newIndex) {
  if (newIndex === currentResolutionIndex) return;
  
  currentResolutionIndex = newIndex;
  saveResolution(newIndex);
  
  try {
        
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //   applyWhiteBalance();
    // }, 100);
    
    await new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          applyVideoTransform();
          await applyZoom(currentZoom);
          setTimeout(resolve, 100);
        } catch (err) {
          console.error('Video play error:', err);
          resolve();
        }
      };
    });
    
    notifyPresetChange();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'resolution_changed',
        resolution: RESOLUTION_PRESETS[currentResolutionIndex].name,
        timestamp: Date.now() 
      }));
    }
    
  } catch (err) {
    console.error('Resolution change error:', err);
      }
}

// Get camera label for display
function getCurrentCameraLabel() {
  if (availableCameras.length === 0) return 'Default Camera';
  
  const currentCamera = availableCameras[currentCameraIndex];
  let label = currentCamera.label;
  
  if (!label || label === '') {
    if (currentCamera.deviceId) {
      label = `Camera ${currentCameraIndex + 1}`;
    } else {
      label = 'Unknown Camera';
    }
  } else {
    label = label.replace(/\([^)]*\)/g, '').trim();
    if (label.toLowerCase().includes('front')) {
      label = 'Front Camera';
    } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear')) {
      label = 'Back Camera';
    } else if (label.length > 20) {
      label = label.substring(0, 17) + '...';
    }
  }
  
  return label;
}

function isFrontCamera() {
  if (availableCameras.length === 0) return false;
  
  const currentCamera = availableCameras[currentCameraIndex];
  if (!currentCamera) return false;
  
  const label = currentCamera.label.toLowerCase();
  
  // Check facingMode first (most reliable)
  if (currentCamera.facingMode === 'user') return true;
  if (currentCamera.facingMode === 'environment') return false;
  
  // Check label for keywords
  // Front camera keywords
  if (label.includes('front') || label.includes('user') || label.includes('selfie') || label.includes('face')) {
    return true;
  }
  
  // Back camera keywords
  if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
    return false;
  }
  
  // For R1: camera index 0 is typically back, camera index 1 is typically front
  // This is a fallback when labels don't give us info
  if (availableCameras.length === 2) {
    return currentCameraIndex === 1;
  }
  
  // Last resort: assume first camera is back camera
  return currentCameraIndex > 0;
}

// Apply mirror transform to video
function applyVideoTransform() {
  try {
    const isFront = isFrontCamera();
    
    if (!isFront) {  // Changed: now mirror when NOT front camera
  video.style.transform = "scaleX(-1) translateZ(0)";
  video.style.webkitTransform = "scaleX(-1) translateZ(0)";
} else {
  video.style.transform = "translateZ(0)";
  video.style.webkitTransform = "translateZ(0)";
}
  } catch (err) {
    console.warn("Mirror transform skipped:", err);
  }
}

// Check if camera supports zoom
function supportsZoom() {
  if (!videoTrack) return false;
  const capabilities = videoTrack.getCapabilities();
  return capabilities && 'zoom' in capabilities;
}

// Get zoom constraints
function getZoomConstraints() {
  if (!videoTrack) return { min: 1, max: 5, step: 0.1 };
  const capabilities = videoTrack.getCapabilities();
  if (capabilities && capabilities.zoom) {
    return {
      min: Math.min(capabilities.zoom.min || 1, 1),
      max: Math.max(capabilities.zoom.max || 5, 5),
      step: capabilities.zoom.step || 0.1
    };
  }
  return { min: 1, max: 5, step: 0.1 };
}

// Apply zoom to video track
async function applyZoom(zoomLevel) {
  if (!videoTrack) return;
  
  try {
    if (supportsZoom()) {
      const constraints = getZoomConstraints();
      const clampedZoom = Math.max(constraints.min, Math.min(zoomLevel, constraints.max));
      
      const constraintsToApply = {
        advanced: [{ zoom: clampedZoom }]
      };
      
      const capabilities = videoTrack.getCapabilities();
      if (capabilities && capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        constraintsToApply.advanced[0].focusMode = 'continuous';
      }
      
      await videoTrack.applyConstraints(constraintsToApply);
      
      currentZoom = clampedZoom;
      
      // Apply mirror transform for front camera even with hardware zoom
      if (!isFrontCamera()) {
        video.style.transform = "scaleX(-1) translateZ(0)";
        video.style.webkitTransform = "scaleX(-1) translateZ(0)";
      } else {
        video.style.transform = "translateZ(0)";
        video.style.webkitTransform = "translateZ(0)";
      }
    } else {
      const clampedZoom = Math.max(1, Math.min(zoomLevel, 5));
      currentZoom = clampedZoom;
      
      if (!isFrontCamera()) {
        video.style.transform = `scaleX(-1) scale(${clampedZoom})`;
        video.style.webkitTransform = `scaleX(-1) scale(${clampedZoom})`;
      } else {
        video.style.transform = `scale(${clampedZoom})`;
        video.style.webkitTransform = `scale(${clampedZoom})`;
      }
    }
  } catch (err) {
    const clampedZoom = Math.max(1, Math.min(zoomLevel, 5));
    currentZoom = clampedZoom;
    
    if (!isFrontCamera()) {
      video.style.transform = `scaleX(-1) scale(${clampedZoom})`;
      video.style.webkitTransform = `scaleX(-1) scale(${clampedZoom})`;
    } else {
      video.style.transform = `scale(${clampedZoom})`;
      video.style.webkitTransform = `scale(${clampedZoom})`;
    }
  }
}

// Trigger manual focus (tap-to-focus simulation)
async function triggerFocus() {
  if (!videoTrack) return;
  
  try {
    const capabilities = videoTrack.getCapabilities();
    
    if (capabilities && capabilities.focusMode) {
      if (capabilities.focusMode.includes('single-shot')) {
        await videoTrack.applyConstraints({
          advanced: [{ 
            focusMode: 'single-shot',
            zoom: currentZoom 
          }]
        });
        console.log('Triggered single-shot focus');
        
        setTimeout(async () => {
          try {
            await videoTrack.applyConstraints({
              advanced: [{ 
                focusMode: 'continuous',
                zoom: currentZoom 
              }]
            });
          } catch (err) {
            console.log('Could not return to continuous focus:', err);
          }
        }, 500);
      } else if (capabilities.focusMode.includes('manual')) {
        await videoTrack.applyConstraints({
          advanced: [{ 
            focusMode: 'manual',
            zoom: currentZoom 
          }]
        });
        console.log('Triggered manual focus');
      }
    }
  } catch (err) {
    console.log('Focus adjustment not supported or failed:', err);
  }
}

// Reset zoom
async function resetZoom() {
  currentZoom = 1;
  await applyZoom(1);
}

// Switch to next camera
async function switchCamera() {
  if (isLoadingCamera || availableCameras.length <= 1) {
    console.log('Cannot switch camera: loading or not enough cameras');
    return;
  }
  
  isLoadingCamera = true;
  
  try {
        
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    console.log(`Switching to camera ${currentCameraIndex + 1} of ${availableCameras.length}`);
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //  applyWhiteBalance();
    // }, 100);
    
    await new Promise((resolve) => {
      if (video.readyState >= 1) {
        video.play().then(() => {
          applyVideoTransform();
          applyZoom(currentZoom);
          setTimeout(resolve, 100);
        }).catch((err) => {
          console.error('Video play error:', err);
          resolve();
        });
      } else {
        video.onloadedmetadata = async () => {
          video.onloadedmetadata = null;
          try {
            await video.play();
            applyVideoTransform();
            await applyZoom(currentZoom);
            setTimeout(resolve, 100);
          } catch (err) {
            console.error('Video play error:', err);
            resolve();
          }
        };
        // Safety timeout so we never hang forever
        setTimeout(resolve, 3000);
      }
    });
    
    notifyPresetChange();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'camera_switched',
        cameraIndex: currentCameraIndex,
        cameraLabel: getCurrentCameraLabel(),
        timestamp: Date.now() 
      }));
    }
    
  } catch (err) {
    console.error('Camera switch error:', err);
        
    currentCameraIndex = (currentCameraIndex - 1 + availableCameras.length) % availableCameras.length;
  } finally {
    isLoadingCamera = false;
  }
}

// Initialize camera
async function initCamera() {
  try {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    capturedImage = document.getElementById('captured-image');
    resetButton = document.getElementById('reset-button');
    
    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      const startText = startScreen.querySelector('.start-text');
      if (startText) {
        startText.textContent = 'Requesting camera access...';
      }
      const startButton = document.getElementById('start-button');
      if (startButton) {
        startButton.disabled = true;
      }
    }
    
        
    // Make camera container visible early so user sees something
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) {
      cameraContainer.style.display = 'flex';
    }
    
    await enumerateCameras();
    
    if (availableCameras.length > 1) {
      const backCameraIndex = availableCameras.findIndex(camera => {
        const label = camera.label.toLowerCase();
        return label.includes('back') || label.includes('rear') || label.includes('environment');
      });
      
      currentCameraIndex = backCameraIndex !== -1 ? backCameraIndex : availableCameras.length - 1;
    } else {
      currentCameraIndex = 0;
    }
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //  applyWhiteBalance();
    // }, 100);
    
    console.log('Camera initialized:', getCurrentCameraLabel());

    loadQueue();
    setupConnectionMonitoring();
    
    await new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          applyVideoTransform();
          applyZoom(1);
          setTimeout(resolve, 100);
        } catch (err) {
          console.error('Video play error:', err);
          resolve();
        }
      };
    });
    
    document.getElementById('start-screen').remove();
    const cameraContainer2 = document.getElementById('camera-container');
    if (cameraContainer2) {
      cameraContainer2.style.display = 'flex';
    }
    
    const cameraButton = document.getElementById('camera-button');
    if (cameraButton && availableCameras.length > 1) {
      cameraButton.style.display = 'flex';
    }
    
    const leftCamCarousel = document.getElementById('left-cam-carousel');
      if (leftCamCarousel) {
        leftCamCarousel.style.display = 'flex';
      }

    // Initialize picker overlay
    const pickerOverlay = document.getElementById('picker-overlay');
    if (pickerOverlay) {
      renderPicker();
      pickerOverlay.style.display = 'flex';
    }

    notifyPresetChange();
    
    // Build the styles menu now that presets are loaded
        
    // Show online indicator for 3 seconds
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus && isOnline) {
      connectionStatus.style.display = 'block';
      setTimeout(() => {
        connectionStatus.style.display = 'none';
      }, 3000);
    }
    
    // Show updates indicator for 3 seconds if updates are available
    if (window.hasPresetsUpdates) {
      const updatesIndicator = document.getElementById('updates-indicator');
      if (updatesIndicator) {
        updatesIndicator.style.display = 'block';
        setTimeout(() => {
          updatesIndicator.style.display = 'none';
        }, 3000);
      }
    }
    
    // Show master prompt indicator if enabled
    updateMasterPromptIndicator();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        status: 'camera_ready',
        availableCameras: availableCameras.length,
        currentCamera: getCurrentCameraLabel(),
        timestamp: Date.now() 
      }));
    }
  } catch (err) {
    console.error('Camera access error:', err);
    // Show more helpful error message based on error type
    let errorMsg = 'Camera error: ' + err.message;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      errorMsg = 'Camera access denied - please allow camera permission';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      errorMsg = 'No camera found on this device';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      errorMsg = 'Camera is in use by another app';
    } else if (err.name === 'SecurityError') {
      errorMsg = 'Camera blocked - HTTPS required for camera access';
    }
    if (CAMERA_PRESETS.length === 0) {
      errorMsg += ' (also: no presets imported)';
    }
        console.log('Camera error details:', err.name, err.message);
    document.getElementById('camera-container').style.display = 'flex';
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        status: 'camera_error',
        error: err.message,
        timestamp: Date.now() 
      }));
    }
  }
}

// Pause camera stream to reduce lag

function pauseCamera() {
  if (stream && video) {
    stream.getTracks().forEach(track => track.stop());
    video.style.display = 'none';
    video.srcObject = null;
    stream = null;
    videoTrack = null;
    isLoadingCamera = false;
  }
}

async function reinitializeCamera() {
  if (!video) return;
  try {
    // Stop any existing stream completely
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
      videoTrack = null;
    }

    // Get a temporary stream so the browser reveals real camera device IDs
    let tempStream = null;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      console.warn('Could not get temp stream for device enumeration:', e);
    }

    // Enumerate cameras now that a stream is active — real device IDs are available
    await enumerateCameras();

    // Stop the temporary stream before starting the real one
    if (tempStream) {
      tempStream.getTracks().forEach(track => track.stop());
    }

    // Small pause to let the browser fully release the temp stream
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start the real camera stream with full device constraints
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);

    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];

    await new Promise((resolve) => {
      if (video.readyState >= 1) {
        video.play().then(() => {
          applyVideoTransform();
          applyZoom(currentZoom);
          setTimeout(resolve, 100);
        }).catch((err) => {
          console.error('Video reinit error:', err);
          resolve();
        });
      } else {
        video.onloadedmetadata = async () => {
          video.onloadedmetadata = null;
          try {
            await video.play();
            applyVideoTransform();
            await applyZoom(currentZoom);
            setTimeout(resolve, 100);
          } catch (err) {
            console.error('Video reinit error:', err);
            resolve();
          }
        };
        setTimeout(resolve, 3000);
      }
    });

    video.style.display = 'block';
    console.log('Camera fully re-initialized. Available cameras:', availableCameras.length);

  } catch (err) {
    console.error('Failed to re-initialize camera:', err);
  }

  // Re-show the style reveal footer
  if (noMagicMode) {
        showStyleReveal('⚡ NO MAGIC MODE');
  } else if (isRandomMode || isMultiPresetMode) {
    let modeName = '';
    if (isRandomMode) modeName = '🎲 Random Mode';
        showStyleReveal(modeName);
  } else {
    notifyPresetChange();
  }
}

// Resume camera stream
async function resumeCamera() {
  if (video) {
    try {
      // Get a temporary stream first so enumerateDevices() can return real device IDs.
      // Without an active stream, browsers hide camera device IDs for privacy,
      // which causes switchCamera() to fail after closing the gallery.
      let tempStream = null;
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (e) {
        console.warn('Could not get temp stream for device enumeration:', e);
      }

      // Re-enumerate cameras now that a stream is active — real device IDs will be returned
      await enumerateCameras();

      // Stop the temporary stream before starting the real one
      if (tempStream) {
        tempStream.getTracks().forEach(track => track.stop());
      }

      // Restart the camera with the correct constraints (proper device IDs now available)
      const constraints = getCameraConstraints();
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      video.srcObject = stream;
      videoTrack = stream.getVideoTracks()[0];

      await new Promise((resolve) => {
        // If metadata is already available, don't wait for the event
        if (video.readyState >= 1) {
          video.play().then(() => {
            applyVideoTransform();
            applyZoom(currentZoom);
            setTimeout(resolve, 100);
          }).catch((err) => {
            console.error('Video resume error:', err);
            resolve();
          });
        } else {
          video.onloadedmetadata = async () => {
            video.onloadedmetadata = null;
            try {
              await video.play();
              applyVideoTransform();
              await applyZoom(currentZoom);
              setTimeout(resolve, 100);
            } catch (err) {
              console.error('Video resume error:', err);
              resolve();
            }
          };
          // Safety timeout so we never hang forever
          setTimeout(resolve, 3000);
        }
      });
      
      video.style.display = 'block';
            
    } catch (err) {
      console.error('Failed to resume camera:', err);
          }
  }
}

// Capture photo and send to WebSocket
async function capturePhoto() {
  if (!stream) return;

  const pickerPreset = getPickerSelectedPreset();
  if (pickerPreset) {
    currentPresetIndex = CAMERA_PRESETS.findIndex(p => p === pickerPreset);
  } else {
    currentPresetIndex = getRandomPresetIndex();
  }

  const activePreset = CAMERA_PRESETS[currentPresetIndex] || CAMERA_PRESETS[0];
  if (!activePreset) {
    showStyleReveal('No presets available');
    return;
  }
  currentPresetIndex = CAMERA_PRESETS.findIndex(p => p === activePreset);
  showStyleReveal(activePreset.name);

  // Only resize if dimensions actually changed to save CPU
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  const ctx = canvas.getContext('2d', { 
    willReadFrequently: false, 
    alpha: false,
    desynchronized: true
  });
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const zoomedWidth = canvas.width / currentZoom;
  const zoomedHeight = canvas.height / currentZoom;
  const offsetX = (canvas.width - zoomedWidth) / 2;
  const offsetY = (canvas.height - zoomedHeight) / 2;
  
  // Since selfie camera (mis-identified as !isFrontCamera) shows mirrored preview,
  // we need to flip the capture back to normal orientation
  if (!isFrontCamera()) {
    // This is actually the SELFIE camera - capture needs double flip to un-mirror
    ctx.save();
    ctx.scale(-1, 1);
    
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      -canvas.width, 0, canvas.width, canvas.height
    );
    
    ctx.restore();
    
    // Now flip the canvas content back to un-mirror the final photo
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(canvas, -canvas.width, 0);
    
    // Copy back to main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
  } else {
    // This is the regular camera - keep as is
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      0, 0, canvas.width, canvas.height
    );
  }
  
  // Apply white balance adjustments to canvas pixels
  // applyWhiteBalanceToCanvas(ctx, canvas.width, canvas.height);
  
  // Use lower quality for higher resolutions to reduce file size
  const quality = currentResolutionIndex >= 2 ? 0.7 : 0.8;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  capturedImage.src = dataUrl;
  // Hide picker during preview
  const pickerOverlay = document.getElementById('picker-overlay');
  if (pickerOverlay) pickerOverlay.style.display = 'none';

  capturedImage.style.display = 'block';
  capturedImage.style.transform = 'none';
  video.style.display = 'none';
  
    // Stop QR detection when photo is captured
  stopQRDetection();

  const cameraButton = document.getElementById('camera-button');
  if (cameraButton) {
    cameraButton.style.display = 'none';
  }
  
  const resolutionButton = document.getElementById('resolution-button');
  if (resolutionButton) {
    resolutionButton.style.display = 'none';
  }
  
  try {
    await addToGallery(dataUrl);
    schedulePhotoPreviewReturn();
  } catch (err) {
    console.error('Failed to save captured photo to gallery:', err);
    showStyleReveal('Save failed');
    return;
  }

  // PRESET CREDIT GAME — earn 1 credit per unique imported preset used to take a photo

  (async () => {
    try {
      const imported = presetImporter.getImportedPresets();
      if (imported.length > 0) {
        const usedPresetName = (activePreset && activePreset.name) ? activePreset.name : (imported[0] ? imported[0].name : '');
        const credited = usedPresetName ? earnCredit(usedPresetName) : false;
        if (credited) {
          playTaDaSound();

          const newTotal = getCredits();
          setTimeout(() => {
            showStyleReveal(`🪙 Credit Earned!\n(${newTotal} total)`);
          }, 1800);
        }
      }
    } catch (e) { /* non-critical, ignore errors */ }
  })();
  
  // CAMERA MULTI-PRESET PATH

  if (isCameraMultiPresetActive && cameraSelectedPresets.length > 0) {
    // Queue one item per selected preset, all sharing the same image
    const presetsToApply = [...cameraSelectedPresets];
    for (let i = 0; i < presetsToApply.length; i++) {
      const preset = presetsToApply[i];
      const manualSelection = null;
      const queueItem = {
        id: Date.now().toString() + '-mp' + i,
        imageBase64: dataUrl,
        preset: preset,
        manualSelection: manualSelection,
        timestamp: Date.now()
      };
      photoQueue.push(queueItem);
    }
    saveQueue();
    updateQueueDisplay();

    if (isOnline && !noMagicMode) {
      if (!isSyncing) {
        syncQueuedPhotos();
      }
    }

    // If timer is NOT active, clear multi-preset state after firing
    clearCameraMultiPresets();
    return;
  }
  // END CAMERA MULTI-PRESET PATH

  // CAMERA LAYER-PRESET PATH
  // Merges all selected layer presets into ONE combined prompt and sends once.

  if (isCameraLayerActive && cameraLayerPresets.length > 0 && !isRandomMode) {
    const combinedPrompt = buildCombinedLayerPrompt(cameraLayerPresets);
    const queueItem = {
      id: Date.now().toString() + '-layer',
      imageBase64: dataUrl,
      preset: {
        name: 'Layer: ' + cameraLayerPresets.map(p => p.name).join(' + '),
        message: combinedPrompt,
        options: [],
        randomizeOptions: false,
        additionalInstructions: ''
      },
      timestamp: Date.now()
    };
    photoQueue.push(queueItem);
    saveQueue();
    updateQueueDisplay();

    if (isOnline && !noMagicMode) {
      if (!isSyncing) syncQueuedPhotos();
    }

    // Layer mode persists — user must tap the lit button to clear it
    return;
  }
  // END CAMERA LAYER-PRESET PATH


  // Use the voice preset if the user just spoke one, then clear it
  // so the next photo goes back to the normally selected preset.
  const currentPreset = window.voicePreset || CAMERA_PRESETS[currentPresetIndex];
  window.voicePreset = null;
  
  const queueItem = {
    id: Date.now().toString(),
    imageBase64: dataUrl,
    preset: currentPreset,
    timestamp: Date.now()
  };
  
  if (noMagicMode) {
    showStyleReveal('Photo saved!');
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({
        action: 'photo_captured',
        queued: false,
        noMagicMode: true,
        queueLength: photoQueue.length,
        timestamp: Date.now()
      }));
    }
    return;
  }

  // Add to queue BEFORE showing modal
  photoQueue.push(queueItem);
  saveQueue();
  updateQueueDisplay();
  
  // If Manual Options is enabled and preset has options, show modal
  
  if (isOnline) {
    showStyleReveal(noMagicMode ? 'Photo saved!' : 'Photo saved! Uploading...');
    if (!isSyncing) {
      syncQueuedPhotos();
    }
  } else {
    showStyleReveal('Photo saved!');
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'photo_captured',
      queued: true,
      queueLength: photoQueue.length,
      timestamp: Date.now() 
    }));
  }
}

async function syncQueuedPhotos() {
  if (photoQueue.length === 0 || isSyncing) {
    return;
  }

  if (noMagicMode) {
    console.log('No Magic Mode enabled; leaving queued photos unsynced');
    showStyleReveal('No Magic Mode');
    return;
  }
  
  if (!isOnline) {
        return;
  }
  
  isSyncing = true;
  syncButton.disabled = true;
  syncButton.classList.add('syncing');
  
  console.log(`Syncing ${photoQueue.length} queued photos...`);
  
  const originalCount = photoQueue.length;
  let successCount = 0;
  
  while (photoQueue.length > 0 && isOnline) {
    const item = photoQueue[0];
    
    try {
            
      if (typeof PluginMessageHandler !== 'undefined' && !noMagicMode) {
        if (item.isCombined) window.isCombinedMode = true;
        const syncedPrompt = getFinalPrompt(item.preset, item.manualSelection || null);
        if (item.isCombined) window.isCombinedMode = false;
        const syncPayload = {
          pluginId: 'com.r1.pixelart',
          imageBase64: item.imageBase64
        };
        if (syncedPrompt && syncedPrompt.trim()) {
          syncPayload.message = syncedPrompt;
        }
        PluginMessageHandler.postMessage(JSON.stringify(syncPayload));
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (isOnline) {
        photoQueue.shift();
        successCount++;
        saveQueue();
        updateQueueDisplay();
      } else {
        console.log('Lost connection during sync');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error('Sync error:', error);
            break;
    }
  }
  
  isSyncing = false;
  syncButton.disabled = false;
  syncButton.classList.remove('syncing');
  
  if (photoQueue.length === 0) {
    const message = noMagicMode 
      ? `All ${successCount} photos saved!`
      : `All ${successCount} photos synced successfully!`;
        setTimeout(() => {
      notifyPresetChange();
    }, 2000);
  } else if (!isOnline) {
      } else {
      }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'sync_complete',
      synced: successCount,
      remaining: photoQueue.length,
      timestamp: Date.now() 
    }));
  }
}

// Show queue manager
function showQueueManager() {
  const manager = document.getElementById('queue-manager');
  const list = document.getElementById('queue-list');
  
  list.innerHTML = '';
  
  if (photoQueue.length === 0) {
    list.innerHTML = `
      <div class="queue-empty">
        <h4>No Photos in Queue</h4>
        <p>Take photos while offline and they'll appear here for syncing.</p>
      </div>
    `;
  } else {
    photoQueue.forEach((item, index) => {
      const queueItem = document.createElement('div');
      queueItem.className = 'queue-item';
      
      queueItem.innerHTML = `
        <div class="queue-item-header">
          <span class="queue-item-style">${item.preset.name}</span>
          <span class="queue-item-time">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <img src="${item.imageBase64}" class="queue-item-preview" alt="Queued photo">
        <div class="queue-item-actions">
          <button onclick="removeFromQueue(${index})" class="delete-button">Remove</button>
          <button onclick="previewQueueItem(${index})" class="secondary">Preview</button>
        </div>
      `;
      
      list.appendChild(queueItem);
    });
  }
  
  manager.style.display = 'flex';
}

// Hide queue manager
function hideQueueManager() {
  document.getElementById('queue-manager').style.display = 'none';
}

// Remove item from queue
async function removeFromQueue(index) {
  if (await confirm('Remove this photo from the sync queue?')) {
    photoQueue.splice(index, 1);
    saveQueue();
    updateQueueDisplay();
    showQueueManager();
  }
}

// Preview queue item
function previewQueueItem(index) {
  const item = photoQueue[index];
  alert(`Style: ${item.preset.name}\nPrompt: ${item.preset.message}\nSaved: ${new Date(item.timestamp).toLocaleString()}`);
}

// Clear entire queue
async function clearQueue() {
  if (await confirm('Clear all photos from the queue? This cannot be undone.')) {
    photoQueue = [];
    saveQueue();
    updateQueueDisplay();
    showQueueManager();
  }
}

// Captures the current camera frame and returns it as a base64 data URL.
// Used by camera live combine mode to grab each photo without triggering
// the full capturePhoto queue/sync flow.
function captureRawPhotoDataUrl() {
  if (!stream) return null;

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false, desynchronized: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const zoomedWidth = canvas.width / currentZoom;
  const zoomedHeight = canvas.height / currentZoom;
  const offsetX = (canvas.width - zoomedWidth) / 2;
  const offsetY = (canvas.height - zoomedHeight) / 2;

  if (!isFrontCamera()) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, offsetX, offsetY, zoomedWidth, zoomedHeight, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(canvas, -canvas.width, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
  } else {
    ctx.drawImage(video, offsetX, offsetY, zoomedWidth, zoomedHeight, 0, 0, canvas.width, canvas.height);
  }

  const quality = currentResolutionIndex >= 2 ? 0.7 : 0.8;
  return canvas.toDataURL('image/jpeg', quality);
}

// Side button handler
window.addEventListener('sideClick', () => {
  console.log('Side button pressed');

  // Block side button during guided tour — advance to next step instead
  if (tourActive) {
    tourNext();
    return;
  }

  // Settings submenu - select current item
  if (isSettingsSubmenuOpen) {
    const submenu = document.getElementById('settings-submenu');
    const items = submenu.querySelectorAll('.menu-section-button');
    if (items.length > 0 && currentSettingsIndex < items.length) {
      items[currentSettingsIndex].click();
    }
    return;
  }

 // Visible Presets submenu - select current item
  if (isVisiblePresetsSubmenuOpen) {
    selectCurrentVisiblePresetsItem();
    return;
  }

  // Tutorial submenu - select current item
  if (isTutorialSubmenuOpen) {
    const glossary = document.getElementById('tutorial-glossary');
    if (glossary && glossary.style.display !== 'none') {
      // In glossary view - select the highlighted item
      const items = glossary.querySelectorAll('.glossary-item');
      if (items.length > 0 && currentTutorialGlossaryIndex < items.length) {
        items[currentTutorialGlossaryIndex].click();
      }
    }
    // If in content view, side button does nothing (just scrolls)
    return;
  }
  
  // Resolution submenu - select current item
  if (isResolutionSubmenuOpen) {
    const submenu = document.getElementById('resolution-submenu');
    const items = submenu.querySelectorAll('.resolution-item');
    if (items.length > 0 && currentResolutionIndex_Menu < items.length) {
      items[currentResolutionIndex_Menu].click();
    }
    return;
  }
  
  if (isPresetSelectorOpen) {
    selectCurrentPresetItem();
    return;
  }
 
  if (isMenuOpen && menuScrollEnabled) {
    selectCurrentMenuItem();
    return;
  }
  
  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-button');
  
  if (startScreen && startScreen.style.display !== 'none') {
    console.log('Simulating tap on start button');
    
    setTimeout(() => {
      startButton.click();
    }, 100);
    
  } else if (capturedImage && capturedImage.style.display === 'block') {

    // If we are in combine mode and waiting for photo 2, don't reset — capture instead

    if (window.isCameraLiveCombineMode && window.cameraCombineFirstPhoto) {
      // Take photo 2 immediately
      const dataUrl = captureRawPhotoDataUrl();
      if (dataUrl) {
        addToGallery(dataUrl).catch(err => {
          console.error('Failed to save first combine photo to gallery:', err);
          showStyleReveal('Save failed');
        });
        const photo1 = window.cameraCombineFirstPhoto;
        window.cameraCombineFirstPhoto = null;
        const voicePresetForCombine = window.cameraCombineVoicePreset || null;
        window.cameraCombineVoicePreset = null;
        finalizeCameraLiveCombine(photo1, dataUrl, voicePresetForCombine, voicePresetForCombine !== null);
      }
    } else {
      resetToCamera();
    }
  } else {
    capturePhoto();
  }
});

// Scroll wheel handler for preset cycling and menu navigation
window.addEventListener('scrollUp', () => {
  console.log('Scroll wheel: up');
  
  // Style Editor
  if (document.getElementById('style-editor').style.display === 'flex') {
      scrollEditorUp();
      return;
  }

  // Preset selector (gallery)
  if (isPresetSelectorOpen) {
    scrollPresetListUp(); // or Down
    return;
  }
  
  // Import presets modal
  if (presetImporter.isImportModalOpen) {
    presetImporter.scrollImportUp();
    return;
  }

  // Guided tour
  if (tourActive) {
    tourBack();
    return;
  }

  // Tutorial submenu - CHECK BEFORE MAIN MENU
  if (isTutorialSubmenuOpen) {
    scrollTutorialUp(); // or Down
    return;
  }

    // Preset Builder submenu
  if (isPresetBuilderSubmenuOpen) {
    scrollPresetBuilderUp();
    return;
  }  
  
  // Visible Presets submenu - CHECK BEFORE MAIN MENU
  if (isVisiblePresetsSubmenuOpen) {
    scrollVisiblePresetsUp(); // or Down
    return;
  }

  // Main menu
  if (isMenuOpen && menuScrollEnabled) {
    scrollMenuUp(); // or Down
    return;
  }
  
  // Master prompt submenu
  if (isMasterPromptSubmenuOpen) {
    scrollMasterPromptUp();
    return;
  }
  
  // Resolution submenu
  if (isResolutionSubmenuOpen) {
    scrollResolutionMenuUp();
    return;
  }
  
  // Settings submenu - CHECK AFTER all other submenus
  if (isSettingsSubmenuOpen) {
    scrollSettingsUp();
    return;
  }
  
  // Gallery
  if (document.getElementById('gallery-modal')?.style.display === 'flex') {
    scrollGalleryUp();
    return;
  }

  // Preset info modal (header tap modal)
  if (isPresetInfoModalOpen) {
    const body = document.querySelector('#preset-info-overlay div div:nth-child(2)');
    if (body) body.scrollTop = Math.max(0, body.scrollTop - 60);
    return;
  }
  
  // Image viewer
  if (document.getElementById('image-viewer')?.style.display === 'flex') {
    scrollViewerUp();
    return;
  }
  
  // Style editor
  if (document.getElementById('style-editor')?.style.display === 'flex') {
    scrollEditorUp();
    return;
  }
  
  // Queue manager
  if (document.getElementById('queue-manager')?.style.display === 'flex') {
    scrollQueueUp();
    return;
  }

  if (handleWheelCameraSwitch()) return;

});

window.addEventListener('scrollDown', () => {
  console.log('Scroll wheel: down');

  // Style Editor
  if (document.getElementById('style-editor').style.display === 'flex') {
      scrollEditorDown();
      return;
  }
  
  // Preset selector (gallery)
  if (isPresetSelectorOpen) {
    scrollPresetListDown();
    return;
  }

  // Import presets modal
  if (presetImporter.isImportModalOpen) {
    presetImporter.scrollImportDown();
    return;
  }

  // Guided tour
  if (tourActive) {
    tourNext();
    return;
  }

  // Tutorial - CHECK BEFORE Settings submenu
  if (isTutorialSubmenuOpen) {
    scrollTutorialDown();
    return;
  }

    // Preset Builder submenu
  if (isPresetBuilderSubmenuOpen) {
    scrollPresetBuilderDown();
    return;
  }

 // Visible Presets submenu
  if (isVisiblePresetsSubmenuOpen) {
    scrollVisiblePresetsDown();
    return;
  }
  
  // Main menu
  if (isMenuOpen && menuScrollEnabled) {
    scrollMenuDown();
    return;
  }

  // Master prompt submenu
  if (isMasterPromptSubmenuOpen) {
    scrollMasterPromptDown();
    return;
  }
  
  // Resolution submenu
  if (isResolutionSubmenuOpen) {
    scrollResolutionMenuDown();
    return;
  }
  
  // Settings submenu - CHECK AFTER all other submenus
  if (isSettingsSubmenuOpen) {
    scrollSettingsDown();
    return;
  }
  
  // Gallery
  if (document.getElementById('gallery-modal')?.style.display === 'flex') {
    scrollGalleryDown();
    return;
  }
  
  // Preset info modal (header tap modal)
  if (isPresetInfoModalOpen) {
    const body = document.querySelector('#preset-info-overlay div div:nth-child(2)');
    if (body) body.scrollTop = Math.min(body.scrollHeight - body.clientHeight, body.scrollTop + 60);
    return;
  }
  
  // Image viewer
  if (document.getElementById('image-viewer')?.style.display === 'flex') {
    scrollViewerDown();
    return;
  }
  
  // Style editor
  if (document.getElementById('style-editor')?.style.display === 'flex') {
    scrollEditorDown();
    return;
  }
  
  // Queue manager
  if (document.getElementById('queue-manager')?.style.display === 'flex') {
    scrollQueueDown();
    return;
  }

  if (handleWheelCameraSwitch()) return;
  
});


function notifyPresetChange() {
  const preset = CAMERA_PRESETS[currentPresetIndex];
  const cleanName = preset ? (preset.displayName || preset.name || 'Unknown').replace(/^[•]\s*/, '').replace(/\s*\b(r1|rabbit|R1|Rabbit)\b\s*/g, ' ').trim().replace(/\s+/g, ' ') : 'Unknown';

  showStyleReveal(noMagicMode ? '⚡ NO MAGIC MODE' : cleanName);
  try {
    localStorage.setItem(LAST_USED_PRESET_KEY, currentPresetIndex.toString());
  } catch (err) {}
  if (isMenuOpen) updateMenuSelection();
}
// Listen for plugin messages (responses from AI)
// NOTE: The full handler including PTT speech-to-text is defined
// at the bottom of this file. This placeholder is kept for reference only.
window.onPluginMessage = window.onPluginMessage || function(data) {};

// Check if Flutter is available
if (typeof PluginMessageHandler !== 'undefined') {
  console.log('Flutter channel is available');
  
  PluginMessageHandler.postMessage(JSON.stringify({ 
    message: 'AI Camera Styles initialized',
    pluginId: 'com.r1.pixelart'
  }));
} else {
  console.log('Running in development mode - Flutter channel not available');
}

// Reset button handler
function resetToCamera() {
  clearPhotoPreviewReturnTimer();
  capturedImage.style.display = 'none';

  capturedImage.style.transform = 'none';
  video.style.display = 'block';
  resetButton.style.display = 'none';

  const cameraButton = document.getElementById('camera-button');
  if (cameraButton && availableCameras.length > 1) {
    cameraButton.style.display = 'flex';
  }

  const resolutionButton = document.getElementById('resolution-button');
  if (resolutionButton) {
    resolutionButton.style.display = 'flex';
  }

  // Restore picker
  const pickerOverlay = document.getElementById('picker-overlay');
  if (pickerOverlay) {
    renderPicker();
    pickerOverlay.style.display = 'flex';
  }

  setTimeout(() => {
    applyZoom(currentZoom);
  }, 50);

  notifyPresetChange();

  // Restart QR detection when returning to camera view
  startQRDetection();
}

// Calculate distance between two touch points
function getTouchDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Setup pinch-to-zoom gesture handlers
function setupPinchZoom() {
  const videoElement = document.getElementById('video');
  
  videoElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching = true;
      initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
      initialZoom = currentZoom;
    }
  }, { passive: false });
  
let zoomThrottleTimeout = null;
videoElement.addEventListener('touchmove', (e) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / initialPinchDistance;
      
      const newZoom = initialZoom * scale;
      const constraints = getZoomConstraints();
      const clampedZoom = Math.max(constraints.min, Math.min(newZoom, constraints.max));
      
      // Throttle zoom updates to every 50ms
      if (!zoomThrottleTimeout) {
        applyZoom(clampedZoom);
        zoomThrottleTimeout = setTimeout(() => {
          zoomThrottleTimeout = null;
        }, 50);
      }
    }
  }, { passive: false });
  
videoElement.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      if (isPinching) {
        triggerFocus();
      }
      isPinching = false;
      console.log('Pinch ended, current zoom:', currentZoom);
    }
  });
  
  videoElement.addEventListener('touchcancel', () => {
    isPinching = false;
  });
}

// Add tap-to-focus functionality
//function setupTapToFocus() {
//  const videoElement = document.getElementById('video');
//  let longPressTimer = null;
//  let isLongPress = false;
//  
//  videoElement.addEventListener('touchstart', (e) => {
//    if (!isMenuOpen && capturedImage.style.display === 'none') {
//      isLongPress = false;
//      
//      // Start long-press timer (500ms)
//      longPressTimer = setTimeout(() => {
//        isLongPress = true;
//        
//        // Visual feedback for long-press
//        const touch = e.touches[0];
//        const rect = videoElement.getBoundingClientRect();
//        const x = touch.clientX - rect.left;
//        const y = touch.clientY - rect.top;
//        
//        const captureIndicator = document.createElement('div');
//        captureIndicator.style.position = 'absolute';
//        captureIndicator.style.left = x + 'px';
//        captureIndicator.style.top = y + 'px';
//        captureIndicator.style.width = '80px';
//        captureIndicator.style.height = '80px';
//        captureIndicator.style.border = '3px solid #4CAF50';
//        captureIndicator.style.borderRadius = '50%';
//        captureIndicator.style.transform = 'translate(-50%, -50%)';
//        captureIndicator.style.pointerEvents = 'none';
//        captureIndicator.style.animation = 'capturePulse 0.4s ease-out';
//        captureIndicator.style.zIndex = '150';
//        captureIndicator.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
//        
//        document.getElementById('camera-container').appendChild(captureIndicator);
//        
//        setTimeout(() => {
//          captureIndicator.remove();
//        }, 400);
//        
//        // Take photo
//        capturePhoto();
//        
//        // Haptic feedback if available
//        if (navigator.vibrate) {
//          navigator.vibrate(50);
//        }
//      }, 500);
//    }
//  });
//  
//  videoElement.addEventListener('touchend', (e) => {
//    if (longPressTimer) {
//      clearTimeout(longPressTimer);
//      longPressTimer = null;
//    }
//    
//    // If it wasn't a long press, do tap-to-focus
//    if (!isLongPress && !isMenuOpen && capturedImage.style.display === 'none') {
//      triggerFocus();
//      
//      const touch = e.changedTouches[0];
//      const rect = videoElement.getBoundingClientRect();
//      const x = touch.clientX - rect.left;
//      const y = touch.clientY - rect.top;
//      
//      const focusIndicator = document.createElement('div');
//      focusIndicator.style.position = 'absolute';
//      focusIndicator.style.left = x + 'px';
//      focusIndicator.style.top = y + 'px';
//      focusIndicator.style.width = '60px';
//      focusIndicator.style.height = '60px';
//      focusIndicator.style.border = '2px solid #FE5F00';
//      focusIndicator.style.borderRadius = '50%';
//      focusIndicator.style.transform = 'translate(-50%, -50%)';
//      focusIndicator.style.pointerEvents = 'none';
//      focusIndicator.style.animation = 'focusPulse 0.6s ease-out';
//      focusIndicator.style.zIndex = '150';
//      
//      document.getElementById('camera-container').appendChild(focusIndicator);
//      
//      setTimeout(() => {
//        focusIndicator.remove();
//      }, 600);
//    }
//  });
//  
//  videoElement.addEventListener('touchcancel', (e) => {
//    if (longPressTimer) {
//      clearTimeout(longPressTimer);
//      longPressTimer = null;
//    }
//  });
//  
//  // Keep click event for non-touch devices (tap-to-focus only)
//  videoElement.addEventListener('click', (e) => {
//    if (!isMenuOpen && capturedImage.style.display === 'none') {
//      triggerFocus();
//      
//      const rect = videoElement.getBoundingClientRect();
//      const x = e.clientX - rect.left;
//      const y = e.clientY - rect.top;
//      
//      const focusIndicator = document.createElement('div');
//      focusIndicator.style.position = 'absolute';
//      focusIndicator.style.left = x + 'px';
//      focusIndicator.style.top = y + 'px';
//      focusIndicator.style.width = '60px';
//      focusIndicator.style.height = '60px';
//      focusIndicator.style.border = '2px solid #FE5F00';
//      focusIndicator.style.borderRadius = '50%';
//      focusIndicator.style.transform = 'translate(-50%, -50%)';
//      focusIndicator.style.pointerEvents = 'none';
//      focusIndicator.style.animation = 'focusPulse 0.6s ease-out';
//      focusIndicator.style.zIndex = '150';
//      
//      document.getElementById('camera-container').appendChild(focusIndicator);
//      
//      setTimeout(() => {
//        focusIndicator.remove();
//      }, 600);
//    }
//  });
//}

// Unified menu functions
function showUnifiedMenu() {
  const menu = document.getElementById('unified-menu');
  
  // Clear any captured image before opening menu
  if (capturedImage && capturedImage.style.display === 'block') {
    resetToCamera();
  }
  
    // Initialize styles count display
  const stylesCountElement = document.getElementById('styles-count');
  if (stylesCountElement) {
    const { favorites, regular } = getStylesLists();
    const totalVisible = favorites.length + regular.length;
    stylesCountElement.textContent = totalVisible;
  }
  updateResolutionDisplay();
  updateMasterPromptDisplay();

  isMenuOpen = true;
  menuScrollEnabled = true;

  pauseCamera();
  menu.style.display = 'flex';
}

async function hideUnifiedMenu() {
  isMenuOpen = false;
  menuScrollEnabled = false;
  currentMenuIndex = 0;
  
  // Hide category hint
  
  document.getElementById('unified-menu').style.display = 'none';
  await resumeCamera();
  
  // Re-show the style reveal footer
  if (noMagicMode) {
    // NO MAGIC MODE overrides everything in footer and popup
        showStyleReveal('⚡ NO MAGIC MODE');
  } else if (isRandomMode) {
    const modeName = '🎲 Random Mode';
        showStyleReveal(modeName);
  } else {
    // Update both footer AND popup immediately
    notifyPresetChange();
  }
}

// Show Settings submenu
function showSettingsSubmenu() {
  isSettingsSubmenuOpen = false;
}

// Hide Settings submenu
function hideSettingsSubmenu() {
  isSettingsSubmenuOpen = false;
  currentSettingsIndex = 0;
}

// Show Timer Settings submenu
// Hide Timer Settings submenu
function jumpToTopOfMenu() {
  const scrollContainer = document.querySelector('.styles-menu-scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    // Reset selection to first item
    currentMenuIndex = 0;
    updateMenuSelection();
  }
}

function jumpToBottomOfMenu() {
  const scrollContainer = document.querySelector('.styles-menu-scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    });
    // Set selection to last item
    const stylesList = document.getElementById('menu-styles-list');
    if (stylesList) {
      const items = stylesList.querySelectorAll('.style-item');
      if (items.length > 0) {
        currentMenuIndex = items.length - 1;
        updateMenuSelection();
      }
    }
  }
}

function updateResolutionDisplay() {
  const display = document.getElementById('current-resolution-display');
  if (display) {
    const res = RESOLUTION_PRESETS[currentResolutionIndex];
    display.textContent = `${res.width}x${res.height}`;
  }
}

function showResolutionSubmenu() {
  currentResolutionIndex = 0;
  isResolutionSubmenuOpen = false;
  isSettingsSubmenuOpen = false;
}

async function hideResolutionSubmenu() {
  isResolutionSubmenuOpen = false;
  currentResolutionIndex_Menu = 0;
}

function showMasterPromptSubmenu() {
  masterPromptText = '';
  masterPromptEnabled = false;
  selectedAspectRatio = 'none';
  isMasterPromptSubmenuOpen = false;
  isSettingsSubmenuOpen = false;
}

async function hideMasterPromptSubmenu() {
  returnToGalleryFromMasterPrompt = false;
  window.masterPromptFromCamera = false;
  isMasterPromptSubmenuOpen = false;
  isSettingsSubmenuOpen = false;
}

function updateCamTapHighlight(mode) {
  const singleBtn = document.getElementById('cam-tap-single');
  const doubleBtn = document.getElementById('cam-tap-double');
  if (singleBtn) {
    if (mode === 'single') {
      singleBtn.style.background = '#ffffff';
      singleBtn.style.color = '#000000';
    } else {
      singleBtn.style.background = '';
      singleBtn.style.color = '';
    }
  }
  if (doubleBtn) {
    if (mode === 'double') {
      doubleBtn.style.background = '#ffffff';
      doubleBtn.style.color = '#000000';
    } else {
      doubleBtn.style.background = '';
      doubleBtn.style.color = '';
    }
  }
}

function updateViewerTapHighlight(mode) {
  const singleBtn = document.getElementById('viewer-tap-single');
  const doubleBtn = document.getElementById('viewer-tap-double');
  if (singleBtn) {
    if (mode === 'single') {
      singleBtn.style.background = '#ffffff';
      singleBtn.style.color = '#000000';
    } else {
      singleBtn.style.background = '';
      singleBtn.style.color = '';
    }
  }
  if (doubleBtn) {
    if (mode === 'double') {
      doubleBtn.style.background = '#ffffff';
      doubleBtn.style.color = '#000000';
    } else {
      doubleBtn.style.background = '';
      doubleBtn.style.color = '';
    }
  }
}

function _syncBtnSettingsCamTab() {
  const s = window._camBtnSettings || { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'double' };
  const colorPicker = document.getElementById('cam-btn-color-picker');
  const opacitySlider = document.getElementById('cam-btn-opacity-slider');
  const opacityValue = document.getElementById('cam-btn-opacity-value');
  const fontColorPicker = document.getElementById('cam-btn-font-color-picker');
  const tapHint = document.getElementById('cam-tap-current-hint');
  if (colorPicker) colorPicker.value = s.bgColor;
  if (opacitySlider) opacitySlider.value = s.opacity;
  if (opacityValue) opacityValue.textContent = s.opacity + '%';
  if (fontColorPicker) fontColorPicker.value = s.fontColor;
  if (tapHint) tapHint.textContent = 'Current: ' + (s.tapMode === 'single' ? 'Single Tap' : 'Double Tap');
  updateCamTapHighlight(s.tapMode || 'double');
}

function _syncBtnSettingsGalleryTab() {
  const s = window._viewerBtnSettings || { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'double' };
  const colorPicker = document.getElementById('viewer-btn-color-picker');
  const opacitySlider = document.getElementById('viewer-btn-opacity-slider');
  const opacityValue = document.getElementById('viewer-btn-opacity-value');
  const fontColorPicker = document.getElementById('viewer-btn-font-color-picker');
  const tapHint = document.getElementById('viewer-tap-current-hint');
  if (colorPicker) colorPicker.value = s.bgColor;
  if (opacitySlider) opacitySlider.value = s.opacity;
  if (opacityValue) opacityValue.textContent = s.opacity + '%';
  if (fontColorPicker) fontColorPicker.value = s.fontColor;
  if (tapHint) tapHint.textContent = 'Current: ' + (s.tapMode === 'single' ? 'Single Tap' : 'Double Tap');
  updateViewerTapHighlight(s.tapMode || 'double');
}

function _switchBtnSettingsTab(tab) {
  const camTab = document.getElementById('btn-tab-cam');
  const galleryTab = document.getElementById('btn-tab-gallery');
  const camPanel = document.getElementById('btn-panel-cam');
  const galleryPanel = document.getElementById('btn-panel-gallery');
  if (tab === 'cam') {
    if (camTab) camTab.classList.add('active');
    if (galleryTab) galleryTab.classList.remove('active');
    if (camPanel) camPanel.classList.add('active');
    if (galleryPanel) galleryPanel.classList.remove('active');
  } else {
    if (camTab) camTab.classList.remove('active');
    if (galleryTab) galleryTab.classList.add('active');
    if (camPanel) camPanel.classList.remove('active');
    if (galleryPanel) galleryPanel.classList.add('active');
  }
}

function showButtonSettingsSubmenu(tab) {
  isSettingsSubmenuOpen = false;
}

function hideButtonSettingsSubmenu() {
  isSettingsSubmenuOpen = false;
}

// Aliases so any other code that calls the old names still works
function showMainCamScreenSubmenu() { showButtonSettingsSubmenu('cam'); }
function hideMainCamScreenSubmenu() { hideButtonSettingsSubmenu(); }
function showGalleryViewerScreenSubmenu() { showButtonSettingsSubmenu('gallery'); }
function hideGalleryViewerScreenSubmenu() { hideButtonSettingsSubmenu(); }

function showAspectRatioSubmenu() {
  selectedAspectRatio = 'none';
  isAspectRatioSubmenuOpen = false;
  isSettingsSubmenuOpen = false;
}

async function hideAspectRatioSubmenu() {
  isAspectRatioSubmenuOpen = false;
}

function updateAspectRatioDisplay() {
  const display = document.getElementById('current-aspect-ratio-display');
  if (display) {
    display.textContent = selectedAspectRatio === 'none' ? 'None' : selectedAspectRatio;
  }
}

function updateMasterPromptDisplay() {
  const display = document.getElementById('current-master-prompt-display');
  if (display) {
    if (masterPromptEnabled && masterPromptText.trim()) {
      const preview = masterPromptText.substring(0, 20);
      display.textContent = `Enabled: ${preview}${masterPromptText.length > 20 ? '...' : ''}`;
    } else if (masterPromptEnabled) {
      display.textContent = 'Enabled (empty)';
    } else {
      display.textContent = 'Disabled';
    }
  }
}

function saveMasterPrompt() {
  masterPromptText = '';
  masterPromptEnabled = false;
  selectedAspectRatio = 'none';
}

function loadMasterPrompt() {
  masterPromptText = '';
  masterPromptEnabled = false;
  selectedAspectRatio = 'none';
  try {
    localStorage.removeItem('r1_camera_master_prompt');
    localStorage.removeItem('r1_camera_master_prompt_enabled');
    localStorage.removeItem('r1_camera_aspect_ratio');
  } catch (err) {}
  updateMasterPromptIndicator();
}

// Load selection history from localStorage
function loadSelectionHistory() {
  try {
    const saved = localStorage.getItem(SELECTION_HISTORY_KEY);
    if (saved) {
      selectionHistory = JSON.parse(saved);
    }
  } catch (err) {
    console.error('Failed to load selection history:', err);
    selectionHistory = {};
  }
}

// Save selection history to localStorage
function saveSelectionHistory() {
  try {
    localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(selectionHistory));
  } catch (err) {
    console.error('Failed to save selection history:', err);
  }
}

// Add a selection to history
function addToHistory(presetName, selection) {
  if (!presetName || !selection) return;
  
  if (!selectionHistory[presetName]) {
    selectionHistory[presetName] = [];
  }
  
  // Add new selection at the beginning
  selectionHistory[presetName].unshift(selection);
  
  // Keep only the last MAX_HISTORY_PER_PRESET selections
  if (selectionHistory[presetName].length > MAX_HISTORY_PER_PRESET) {
    selectionHistory[presetName] = selectionHistory[presetName].slice(0, MAX_HISTORY_PER_PRESET);
  }
  
  saveSelectionHistory();
}

// Clear history for a specific preset (useful for testing)
function clearPresetHistory(presetName) {
  if (presetName && selectionHistory[presetName]) {
    delete selectionHistory[presetName];
    saveSelectionHistory();
  }
}

// Clear all selection history
function clearAllHistory() {
  selectionHistory = {};
  saveSelectionHistory();
}

function editStyle(index) {
  editingStyleIndex = index;
  const preset = CAMERA_PRESETS[index];
  
  document.getElementById('style-name').value = preset.name;
  document.getElementById('style-message').value = preset.message || '';
  
  const categoryInput = document.getElementById('style-category');
  if (categoryInput) {
    categoryInput.value = preset.category ? preset.category.join(', ') : '';
  }
  
  // Clear and reload option fields
  clearStyleEditorOptionFields();
  
  // Load additional instructions
  const additionalEl = document.getElementById('style-additional');
  if (additionalEl) additionalEl.value = preset.additionalInstructions || '';
  
  // Load randomize options and options data
  const randomizeEl = document.getElementById('style-randomize');
  const selectionTypeEl = document.getElementById('style-selection-type');
  
  if (randomizeEl && preset.randomizeOptions) {
    randomizeEl.checked = true;
    document.getElementById('style-selection-type-container').style.display = 'block';
    
    if (preset.optionGroups && preset.optionGroups.length > 0) {
      selectionTypeEl.value = 'multi';
      document.getElementById('style-single-options-container').style.display = 'none';
      document.getElementById('style-multi-options-container').style.display = 'block';
      preset.optionGroups.forEach(group => addStyleOptionGroup(group.title, group.options));
    } else if (preset.options && preset.options.length > 0) {
      selectionTypeEl.value = 'single';
      document.getElementById('style-single-options-container').style.display = 'block';
      document.getElementById('style-multi-options-container').style.display = 'none';
      preset.options.forEach(opt => addStyleSingleOption(opt.text, opt.enabled !== false));
    }
  }
  
  document.getElementById('delete-style').style.display = 'block';
  
  showStyleEditor('Edit Style');
}

async function saveStyle() {
  const name = document.getElementById('style-name').value.trim();
  const message = document.getElementById('style-message').value.trim();
  const categoryInput = document.getElementById('style-category').value.trim();
  
  // Parse categories from comma-separated string
  const category = categoryInput ? 
    categoryInput.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0) : 
    [];
  
  if (!name) {
    alert('Please fill in the style name');
    return;
  }
  
  // Collect option fields
  const styleRandomize = document.getElementById('style-randomize');
  const styleSelectionType = document.getElementById('style-selection-type');
  const styleAdditional = document.getElementById('style-additional');
  const randomizeOptions = styleRandomize ? styleRandomize.checked : false;
  const additionalInstructions = styleAdditional ? styleAdditional.value.trim() : '';
  let options = [];
  let optionGroups = [];
  if (randomizeOptions && styleSelectionType) {
    if (styleSelectionType.value === 'single') {
      options = collectStyleSingleOptions();
    } else {
      optionGroups = collectStyleOptionGroups();
    }
  }
  
  if (editingStyleIndex >= 0) {
    const oldName = CAMERA_PRESETS[editingStyleIndex].name;
    const wasCustom = CAMERA_PRESETS[editingStyleIndex].internal === false;
      CAMERA_PRESETS[editingStyleIndex] = { name, category, message, options, optionGroups, randomizeOptions, additionalInstructions, internal: wasCustom ? false : undefined };
    
    // Check if it's a factory preset OR imported preset
    const isFactoryPreset = factoryPresets.some(p => p.name === oldName);
    const isImportedPreset = hasImportedPresets && presetImporter.getImportedPresets().some(p => p.name === oldName);
    
    if (isFactoryPreset || isImportedPreset) {
      // Save as modification (doesn't change the original)
      await presetStorage.saveModification(oldName, {
        name: name,
        message: message,
        category: category,
        options: options,
        optionGroups: optionGroups,
        randomizeOptions: randomizeOptions,
        additionalInstructions: additionalInstructions
      });
    } else {
      // User-created preset - update it directly, preserving internal: false
      await presetStorage.saveNewPreset({ name, category, message, options, optionGroups, randomizeOptions, additionalInstructions, internal: false });
    }
    
    // If name changed, update visiblePresets array
    if (oldName !== name) {
      const visIndex = visiblePresets.indexOf(oldName);
      if (visIndex > -1) {
        visiblePresets[visIndex] = name;
        saveVisiblePresets();
      }
    }
  } else {
    const newPreset = { name, category, message, options, optionGroups, randomizeOptions, additionalInstructions };
    await presetStorage.saveNewPreset(newPreset);
    CAMERA_PRESETS.push(newPreset);
    // ADD NEW PRESET TO VISIBLE LIST AUTOMATICALLY
    visiblePresets.push(name);
    saveVisiblePresets();
  }
  
  // saveStyles(); // REMOVED - redundant, already saved to IndexedDB above
  
  alert(editingStyleIndex >= 0 ? `Preset "${name}" updated!` : `Preset "${name}" saved!`);
  
  const cameFromViewer = returnToGalleryFromViewerEdit;
  hideStyleEditor();
  if (!cameFromViewer) {
    showUnifiedMenu();
  }
}

async function deleteStyle() {
  if (editingStyleIndex >= 0 && CAMERA_PRESETS.length > 1) {
    if (await confirm('Delete this style?')) {
      const presetName = CAMERA_PRESETS[editingStyleIndex].name;
      
      // Check if it's a factory preset, imported preset, or user-created
      const isFactoryPreset = factoryPresets.some(p => p.name === presetName);
      const isImportedPreset = hasImportedPresets && presetImporter.getImportedPresets().some(p => p.name === presetName);
      
      if (isImportedPreset) {
        // Delete from imported presets
        await presetImporter.deletePreset(presetName);
      } else if (isFactoryPreset) {
        // Mark factory preset as deleted
        await presetStorage.saveDeletion(presetName);
      } else {
        // Remove user-created preset
        await presetStorage.removeModification(presetName);
      }
      
      CAMERA_PRESETS.splice(editingStyleIndex, 1);
      
      // Remove from visible presets
      const visIndex = visiblePresets.indexOf(presetName);
      if (visIndex > -1) {
        visiblePresets.splice(visIndex, 1);
        saveVisiblePresets();
      }
      
      // Save whether we're deleting the currently active preset BEFORE modifying currentPresetIndex
      const deletingCurrentPreset = (editingStyleIndex === currentPresetIndex);
      
      // Determine new current preset index after deletion
      if (editingStyleIndex === currentPresetIndex) {
        // We deleted the currently selected preset
        // Move to previous preset, or stay at 0 if we deleted the first one
        currentPresetIndex = Math.max(0, editingStyleIndex - 1);
      } else if (editingStyleIndex < currentPresetIndex) {
        // We deleted a preset before the current one, so shift current index down
        currentPresetIndex = currentPresetIndex - 1;
      }
      // If we deleted a preset after the current one, currentPresetIndex stays the same
      
      // Ensure index is within bounds
      currentPresetIndex = Math.max(0, Math.min(currentPresetIndex, CAMERA_PRESETS.length - 1));
      
      saveStyles();
      
      // If we deleted the currently active preset, switch to first visible preset
      if (deletingCurrentPreset) {
        const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
        if (visiblePresetObjects.length > 0) {
          currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
        } else if (CAMERA_PRESETS.length > 0) {
          // No visible presets, just use first available
          currentPresetIndex = 0;
        }
      }
      
      // After deletion, verify the current preset is visible; if not, switch to first visible
      const currentPreset = CAMERA_PRESETS[currentPresetIndex];
      if (currentPreset && !visiblePresets.includes(currentPreset.name)) {
        // Current preset is not visible, switch to first visible preset
        const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
        if (visiblePresetObjects.length > 0) {
          currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
        } else if (CAMERA_PRESETS.length > 0) {
          // No visible presets, just use first available
          currentPresetIndex = 0;
        }
      }
      
      // Update the preset display to reflect the switch
        notifyPresetChange();
      
        // Update visible presets display to reflect deletion
        updateVisiblePresetsDisplay();

        // Clear viewer loaded preset and reset gallery header since the preset is gone
        window.viewerLoadedPreset = null;
        const deletedPresetHeader = document.getElementById('viewer-preset-header');
        if (deletedPresetHeader) deletedPresetHeader.textContent = 'NO PRESET LOADED';
      
        const cameFromViewer = returnToGalleryFromViewerEdit;
        hideStyleEditor();
      
      if (!cameFromViewer) {
        // Save scroll position before showing menu
        const scrollContainer = document.querySelector('.styles-menu-scroll-container');
        const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
        
        showUnifiedMenu();
        
        // Restore scroll position after menu is shown
        if (scrollContainer) {
          requestAnimationFrame(() => {
            scrollContainer.scrollTop = scrollPosition;
          });
        }
      }
      
      alert(`Preset "${presetName}" deleted successfully!`);
    }
  }
}

// Generate mechanical camera shutter sound using Web Audio API
function playCameraShutterSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const currentTime = audioContext.currentTime;
    
    // === INTRO: High-pitched metallic prep sound ===
    const introOsc = audioContext.createOscillator();
    const introGain = audioContext.createGain();
    const introFilter = audioContext.createBiquadFilter();
    
    introOsc.type = 'square';
    introOsc.frequency.setValueAtTime(2400, currentTime);
    introOsc.frequency.exponentialRampToValueAtTime(1800, currentTime + 0.012);
    
    introFilter.type = 'highpass';
    introFilter.frequency.setValueAtTime(1500, currentTime);
    
    introGain.gain.setValueAtTime(0.5, currentTime);
    introGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.015);
    
    introOsc.connect(introFilter);
    introFilter.connect(introGain);
    introGain.connect(audioContext.destination);
    
    introOsc.start(currentTime);
    introOsc.stop(currentTime + 0.015);
    
    // === FIRST CLICK: Shutter opening (sharp, metallic) ===
    const click1Osc = audioContext.createOscillator();
    const click1Gain = audioContext.createGain();
    const click1Filter = audioContext.createBiquadFilter();
    
    click1Osc.type = 'square';
    click1Osc.frequency.setValueAtTime(1200, currentTime + 0.015);
    click1Osc.frequency.exponentialRampToValueAtTime(200, currentTime + 0.023);
    
    click1Filter.type = 'bandpass';
    click1Filter.frequency.setValueAtTime(1500, currentTime + 0.015);
    click1Filter.Q.setValueAtTime(2, currentTime + 0.015);
    
    click1Gain.gain.setValueAtTime(0.4, currentTime + 0.015);
    click1Gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.030);
    
    click1Osc.connect(click1Filter);
    click1Filter.connect(click1Gain);
    click1Gain.connect(audioContext.destination);
    
    click1Osc.start(currentTime + 0.015);
    click1Osc.stop(currentTime + 0.030);
    
    // === MECHANICAL RATTLE: Spring tension ===
    const rattleOsc = audioContext.createOscillator();
    const rattleGain = audioContext.createGain();
    
    rattleOsc.type = 'triangle';
    rattleOsc.frequency.setValueAtTime(400, currentTime + 0.023);
    rattleOsc.frequency.setValueAtTime(450, currentTime + 0.027);
    rattleOsc.frequency.setValueAtTime(380, currentTime + 0.031);
    rattleOsc.frequency.setValueAtTime(420, currentTime + 0.035);
    
    rattleGain.gain.setValueAtTime(0, currentTime + 0.023);
    rattleGain.gain.linearRampToValueAtTime(0.15, currentTime + 0.025);
    rattleGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.040);
    
    rattleOsc.connect(rattleGain);
    rattleGain.connect(audioContext.destination);
    
    rattleOsc.start(currentTime + 0.023);
    rattleOsc.stop(currentTime + 0.040);
    
    // === SECOND CLICK: Shutter closing (deeper, firm) ===
    const click2Osc = audioContext.createOscillator();
    const click2Gain = audioContext.createGain();
    const click2Filter = audioContext.createBiquadFilter();
    
    click2Osc.type = 'square';
    click2Osc.frequency.setValueAtTime(800, currentTime + 0.050);
    click2Osc.frequency.exponentialRampToValueAtTime(150, currentTime + 0.060);
    
    click2Filter.type = 'bandpass';
    click2Filter.frequency.setValueAtTime(1000, currentTime + 0.050);
    click2Filter.Q.setValueAtTime(2, currentTime + 0.050);
    
    click2Gain.gain.setValueAtTime(0.5, currentTime + 0.050);
    click2Gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.070);
    
    click2Osc.connect(click2Filter);
    click2Filter.connect(click2Gain);
    click2Gain.connect(audioContext.destination);
    
    click2Osc.start(currentTime + 0.050);
    click2Osc.stop(currentTime + 0.070);
    
    // === METAL RESONANCE: Body vibration ===
    const resonanceOsc = audioContext.createOscillator();
    const resonanceGain = audioContext.createGain();
    const resonanceFilter = audioContext.createBiquadFilter();
    
    resonanceOsc.type = 'sine';
    resonanceOsc.frequency.setValueAtTime(180, currentTime + 0.050);
    resonanceOsc.frequency.exponentialRampToValueAtTime(120, currentTime + 0.095);
    
    resonanceFilter.type = 'lowpass';
    resonanceFilter.frequency.setValueAtTime(300, currentTime + 0.050);
    
    resonanceGain.gain.setValueAtTime(0, currentTime + 0.050);
    resonanceGain.gain.linearRampToValueAtTime(0.2, currentTime + 0.055);
    resonanceGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.105);
    
    resonanceOsc.connect(resonanceFilter);
    resonanceFilter.connect(resonanceGain);
    resonanceGain.connect(audioContext.destination);
    
    resonanceOsc.start(currentTime + 0.050);
    resonanceOsc.stop(currentTime + 0.105);
    
    // === FILM ADVANCE: Mechanical winding ===
    const bufferSize = audioContext.sampleRate * 0.08;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Create rhythmic noise pattern for gear sound
      const rhythm = Math.sin(i / 200) * 0.5 + 0.5;
      output[i] = (Math.random() * 2 - 1) * rhythm;
    }
    
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3000, currentTime + 0.070);
    noiseFilter.Q.setValueAtTime(1, currentTime + 0.070);
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0, currentTime + 0.070);
    noiseGain.gain.linearRampToValueAtTime(0.12, currentTime + 0.075);
    noiseGain.gain.linearRampToValueAtTime(0.12, currentTime + 0.125);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.150);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    
    noiseSource.start(currentTime + 0.070);
    noiseSource.stop(currentTime + 0.150);
    
    // === FINAL LOCK CLICK: Winding complete ===
    const lockOsc = audioContext.createOscillator();
    const lockGain = audioContext.createGain();
    
    lockOsc.type = 'square';
    lockOsc.frequency.setValueAtTime(600, currentTime + 0.145);
    lockOsc.frequency.exponentialRampToValueAtTime(100, currentTime + 0.155);
    
    lockGain.gain.setValueAtTime(0.25, currentTime + 0.145);
    lockGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.165);
    
    lockOsc.connect(lockGain);
    lockGain.connect(audioContext.destination);
    
    lockOsc.start(currentTime + 0.145);
    lockOsc.stop(currentTime + 0.165);
    
  } catch (err) {
    console.log('Audio generation failed:', err);
  }
}

// Initialize on load
window.addEventListener('load', () => {
  loadStyles();
  loadMasterPrompt();
  loadSelectionHistory();
  setupPinchZoom();
//  setupTapToFocus();
  
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

  // R1 requires user interaction before camera access
  // Show splash screen with "Tap to start" hint
  const startScreen = document.getElementById('start-screen');
  if (startScreen) {
    startScreen.addEventListener('pointerup', function() {
      startScreen.style.display = 'none';
      initCamera();
    }, { passive: true });
  }

  // Mode carousel buttons removed

  const menuBtn = document.getElementById('menu-button');
  if (menuBtn) {
    menuBtn.addEventListener('click', showUnifiedMenu);
  }
  
  const closeMenuBtn = document.getElementById('close-menu');
  if (closeMenuBtn) {
    closeMenuBtn.addEventListener('click', hideUnifiedMenu);
  }

  const jumpToTopBtn = document.getElementById('jump-to-top');
  if (jumpToTopBtn) {
    let menuUpTapTimer = null;
    jumpToTopBtn.addEventListener('click', () => {
      if (menuUpTapTimer) {
        // Double-tap: jump to very top
        clearTimeout(menuUpTapTimer);
        menuUpTapTimer = null;
        jumpToTopOfMenu();
      } else {
        menuUpTapTimer = setTimeout(() => {
          menuUpTapTimer = null;
          // Single-tap: scroll up one page
          const scrollContainer = document.querySelector('.styles-menu-scroll-container');
          if (scrollContainer) {
            scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - scrollContainer.clientHeight);
          }
        }, 300);
      }
    });
  }

  const jumpToBottomBtn = document.getElementById('jump-to-bottom');
  if (jumpToBottomBtn) {
    let menuDownTapTimer = null;
    jumpToBottomBtn.addEventListener('click', () => {
      if (menuDownTapTimer) {
        // Double-tap: jump to very bottom
        clearTimeout(menuDownTapTimer);
        menuDownTapTimer = null;
        jumpToBottomOfMenu();
      } else {
        menuDownTapTimer = setTimeout(() => {
          menuDownTapTimer = null;
          // Single-tap: scroll down one page
          const scrollContainer = document.querySelector('.styles-menu-scroll-container');
          if (scrollContainer) {
            scrollContainer.scrollTop = Math.min(
              scrollContainer.scrollHeight - scrollContainer.clientHeight,
              scrollContainer.scrollTop + scrollContainer.clientHeight
            );
          }
        }, 300);
      }
    });
  }
  
  const settingsMenuBtn = document.getElementById('settings-menu-button');
  if (settingsMenuBtn) {
    settingsMenuBtn.addEventListener('click', showSettingsSubmenu);
  }
  
  // + button in main menu header — opens preset builder, returns to main menu on exit
  const menuAddPresetBtn = document.getElementById('menu-add-preset-button');
  if (menuAddPresetBtn) {
    menuAddPresetBtn.addEventListener('click', () => {
      returnToMainMenuFromBuilder = true;
      hideUnifiedMenu();
      document.getElementById('preset-builder-submenu').style.display = 'flex';
      isMenuOpen = false;
      isSettingsSubmenuOpen = false;
      isPresetBuilderSubmenuOpen = true;
      clearPresetBuilderForm();
    });
  }

  // Tapping the preset header shows a scrollable modal with fixed name, scrollable body, fixed buttons
  const viewerPresetHeader = document.getElementById('viewer-preset-header');
  if (viewerPresetHeader) {
    viewerPresetHeader.addEventListener('click', () => {

      // Helper that builds and shows the overlay modal
      function showPresetInfoModal(titleText, bodyText, speakText) {
        const overlay = document.createElement('div');
        overlay.id = 'preset-info-overlay';
        overlay.style.cssText = `
          position: fixed; inset: 0; z-index: 200000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
        `;

        // Read button only shown when there is something to speak
        const readBtnHTML = speakText ? `<button id="preset-info-speak-btn" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:5px;font-size:10px;font-weight:600;padding:0 10px;height:22px !important;min-height:0 !important;line-height:22px;min-width:52px;cursor:pointer;text-transform:uppercase;letter-spacing:0.3px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;">🔊 Read</button>` : '';

        overlay.innerHTML = `
          <div style="
            position: relative;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            width: 85vw;
            max-width: 340px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          ">
            <!-- Fixed title -->
            <div style="
              padding: 12px 16px 8px;
              border-bottom: 1px solid rgba(255,255,255,0.1);
              flex-shrink: 0;
            ">
              <div style="
                font-size: 13px;
                font-weight: 700;
                color: #FE5F00;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                word-break: break-word;
              ">${titleText}</div>
            </div>
            <!-- Scrollable body -->
            <div style="
              padding: 10px 16px;
              overflow-y: auto;
              flex: 1;
              min-height: 40px;
              -webkit-overflow-scrolling: touch;
            ">
              <div style="
                font-size: 13px;
                line-height: 1.5;
                color: #ddd;
                word-wrap: break-word;
                white-space: pre-wrap;
              ">${bodyText}</div>
            </div>
            <!-- Fixed button row -->
            <div style="
              padding: 6px 16px 8px;
              border-top: 1px solid rgba(255,255,255,0.1);
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-shrink: 0;
              gap: 12px;
            ">
              ${readBtnHTML}
              <button id="preset-info-exit-btn" style="background:linear-gradient(135deg,#4CAF50 0%,#45a049 100%);color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:600;padding:0 10px;height:22px !important;min-height:0 !important;line-height:22px;min-width:52px;cursor:pointer;text-transform:uppercase;letter-spacing:0.3px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;">EXIT</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);
                   isPresetInfoModalOpen = true;

        const exitBtn = document.getElementById('preset-info-exit-btn');
        const speakBtn = document.getElementById('preset-info-speak-btn');

        const closeModal = () => {
          tourStopSpeaking();
          isPresetInfoModalOpen = false;
          exitBtn.removeEventListener('click', closeModal);
          if (speakBtn) speakBtn.removeEventListener('click', handleSpeak);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        const handleSpeak = () => {
          tourSpeak(speakText);
          if (speakBtn) {
            speakBtn.style.background = 'rgba(254, 95, 0, 0.7)';
            speakBtn.style.borderColor = '#FE5F00';
            speakBtn.style.color = '#fff';
            setTimeout(() => {
              if (speakBtn) {
                speakBtn.style.background = 'rgba(255,255,255,0.1)';
                speakBtn.style.borderColor = 'rgba(255,255,255,0.2)';
                speakBtn.style.color = '#fff';
              }
            }, 1500);
          }
        };

        exitBtn.addEventListener('click', closeModal);
        if (speakBtn) speakBtn.addEventListener('click', handleSpeak);
      }

      // Multi preset mode active in gallery viewer
      if (!window.viewerLoadedPreset && !isGalleryLayerActive) {
        const multiHeader = document.getElementById('viewer-preset-header');
        if (multiHeader && multiHeader.textContent.startsWith('🎞️ MULTI')) {
          showPresetInfoModal(
            multiHeader.textContent,
            'Multiple presets are queued to apply to this image sequentially.\n\nTap ✨ MAGIC to apply them.',
            null
          );
          return;
        }
      }
      
      // Layer mode active — show info but nothing to speak

      if (isGalleryLayerActive && galleryLayerPresets.length > 0) {
        const layerNames = galleryLayerPresets
          .map((p, i) => i === 0 ? `PRIMARY: ${p.name}` : `Layer ${i}: ${p.name}`)
          .join('\n');
        showPresetInfoModal(
          '📑 Layer Mode Active',
          `${galleryLayerPresets.length} presets combined into one transform:\n\n${layerNames}\n\nTap ✨ MAGIC to apply again.`,
          null
        );
        return;
      }

      // No preset loaded — show info modal with Magic button hint
      if (!window.viewerLoadedPreset) {
        showPresetInfoModal(
          'No Preset Loaded',
          'No preset is currently loaded.\n\nIf you tap the ✨ MAGIC button without loading a preset, it will automatically pick a random preset for you.',
          null
        );
        return;
      }

      // Preset is loaded — show name and first sentence
      const preset = window.viewerLoadedPreset;
      const firstSentence = (preset.message || '').split('.')[0].trim() + '.';
      showPresetInfoModal(
        preset.name,
        firstSentence,
        preset.name + '. ' + firstSentence
      );
    });
  }

  const settingsBackBtn = document.getElementById('settings-back');
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', hideSettingsSubmenu);
  }
  
  const settingsJumpUpBtn = document.getElementById('settings-jump-up');
  if (settingsJumpUpBtn) {
    let settingsUpTapTimer = null;
    settingsJumpUpBtn.addEventListener('click', () => {
      if (settingsUpTapTimer) {
        // Double-tap: jump to top
        clearTimeout(settingsUpTapTimer);
        settingsUpTapTimer = null;
        currentSettingsIndex = 0;
        updateSettingsSelection();
      } else {
        // Single-tap: wait to see if double-tap follows
        settingsUpTapTimer = setTimeout(() => {
          settingsUpTapTimer = null;
          // Page up: move up by several items
          const submenu = document.getElementById('settings-submenu');
          if (submenu) {
            const container = submenu.querySelector('.submenu-list');
            if (container) {
              const pageHeight = container.clientHeight;
              container.scrollTop = Math.max(0, container.scrollTop - pageHeight);
            }
          }
          const submenu2 = document.getElementById('settings-submenu');
          if (submenu2) {
            const items = submenu2.querySelectorAll('.menu-section-button');
            const pageItems = Math.max(1, Math.floor(items.length / 3));
            currentSettingsIndex = Math.max(0, currentSettingsIndex - pageItems);
            updateSettingsSelection();
          }
        }, 300);
      }
    });
  }

  const settingsJumpDownBtn = document.getElementById('settings-jump-down');
  if (settingsJumpDownBtn) {
    let settingsDownTapTimer = null;
    settingsJumpDownBtn.addEventListener('click', () => {
      if (settingsDownTapTimer) {
        // Double-tap: jump to bottom
        clearTimeout(settingsDownTapTimer);
        settingsDownTapTimer = null;
        const submenu = document.getElementById('settings-submenu');
        if (submenu) {
          const items = submenu.querySelectorAll('.menu-section-button');
          currentSettingsIndex = items.length - 1;
          updateSettingsSelection();
        }
      } else {
        // Single-tap: wait to see if double-tap follows
        settingsDownTapTimer = setTimeout(() => {
          settingsDownTapTimer = null;
          // Page down
          const submenu = document.getElementById('settings-submenu');
          if (submenu) {
            const container = submenu.querySelector('.submenu-list');
            if (container) {
              const pageHeight = container.clientHeight;
              container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + pageHeight);
            }
            const items = submenu.querySelectorAll('.menu-section-button');
            const pageItems = Math.max(1, Math.floor(items.length / 3));
            currentSettingsIndex = Math.min(items.length - 1, currentSettingsIndex + pageItems);
            updateSettingsSelection();
          }
        }, 300);
      }
    });
  }

  const resolutionSettingsBtn = document.getElementById('resolution-settings-button');
  if (resolutionSettingsBtn) {
    resolutionSettingsBtn.addEventListener('click', showResolutionSubmenu);
  }
  
  const resolutionBackBtn = document.getElementById('resolution-back');
  if (resolutionBackBtn) {
    resolutionBackBtn.addEventListener('click', hideResolutionSubmenu);
  }
  
  const masterPromptSettingsBtn = document.getElementById('master-prompt-settings-button');
  if (masterPromptSettingsBtn) {
    masterPromptSettingsBtn.addEventListener('click', showMasterPromptSubmenu);
  }
  
  const masterPromptBackBtn = document.getElementById('master-prompt-back');
  if (masterPromptBackBtn) {
    masterPromptBackBtn.addEventListener('click', hideMasterPromptSubmenu);
  }
  
  // Button Settings (combined Main Camera + Gallery tabs)

  const buttonSettingsBtn = document.getElementById('button-settings-button');
  if (buttonSettingsBtn) {
    buttonSettingsBtn.addEventListener('click', () => showButtonSettingsSubmenu('cam'));
  }

  const buttonSettingsBackBtn = document.getElementById('button-settings-back');
  if (buttonSettingsBackBtn) {
    buttonSettingsBackBtn.addEventListener('click', hideButtonSettingsSubmenu);
  }

  const btnTabCam = document.getElementById('btn-tab-cam');
  if (btnTabCam) {
    btnTabCam.addEventListener('click', () => _switchBtnSettingsTab('cam'));
  }

  const btnTabGallery = document.getElementById('btn-tab-gallery');
  if (btnTabGallery) {
    btnTabGallery.addEventListener('click', () => _switchBtnSettingsTab('gallery'));
  }

  const camBtnColorPicker = document.getElementById('cam-btn-color-picker');
  if (camBtnColorPicker) {
    camBtnColorPicker.addEventListener('input', (e) => {
      window._camBtnSettings.bgColor = e.target.value;
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camBtnOpacitySlider = document.getElementById('cam-btn-opacity-slider');
  if (camBtnOpacitySlider) {
    camBtnOpacitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      window._camBtnSettings.opacity = val;
      const opacityValueEl = document.getElementById('cam-btn-opacity-value');
      if (opacityValueEl) opacityValueEl.textContent = val + '%';
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camBtnColorDefaultBtn = document.getElementById('cam-btn-color-default');
  if (camBtnColorDefaultBtn) {
    camBtnColorDefaultBtn.addEventListener('click', () => {
      window._camBtnSettings.bgColor = '#000000';
      window._camBtnSettings.opacity = 100;
      const colorPickerEl = document.getElementById('cam-btn-color-picker');
      const opacitySliderEl = document.getElementById('cam-btn-opacity-slider');
      const opacityValueEl = document.getElementById('cam-btn-opacity-value');
      if (colorPickerEl) colorPickerEl.value = '#000000';
      if (opacitySliderEl) opacitySliderEl.value = 100;
      if (opacityValueEl) opacityValueEl.textContent = '100%';
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camBtnFontColorPicker = document.getElementById('cam-btn-font-color-picker');
  if (camBtnFontColorPicker) {
    camBtnFontColorPicker.addEventListener('input', (e) => {
      window._camBtnSettings.fontColor = e.target.value;
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camBtnFontColorDefaultBtn = document.getElementById('cam-btn-font-color-default');
  if (camBtnFontColorDefaultBtn) {
    camBtnFontColorDefaultBtn.addEventListener('click', () => {
      window._camBtnSettings.fontColor = '#ffffff';
      const fontColorPickerEl = document.getElementById('cam-btn-font-color-picker');
      if (fontColorPickerEl) fontColorPickerEl.value = '#ffffff';
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camTapSingleBtn = document.getElementById('cam-tap-single');
  if (camTapSingleBtn) {
    camTapSingleBtn.addEventListener('click', () => {
      window._camBtnSettings.tapMode = 'single';
      const tapHintEl = document.getElementById('cam-tap-current-hint');
      if (tapHintEl) tapHintEl.textContent = 'Current: Single Tap';
      updateCamTapHighlight('single');
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camTapDoubleBtn = document.getElementById('cam-tap-double');
  if (camTapDoubleBtn) {
    camTapDoubleBtn.addEventListener('click', () => {
      window._camBtnSettings.tapMode = 'double';
      const tapHintEl = document.getElementById('cam-tap-current-hint');
      if (tapHintEl) tapHintEl.textContent = 'Current: Double Tap';
      updateCamTapHighlight('double');
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }

  const camScreenResetAllBtn = document.getElementById('cam-screen-reset-all');
  if (camScreenResetAllBtn) {
    camScreenResetAllBtn.addEventListener('click', () => {
      window._camBtnSettings = { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'single' };
      const colorPickerEl = document.getElementById('cam-btn-color-picker');
      const opacitySliderEl = document.getElementById('cam-btn-opacity-slider');
      const opacityValueEl = document.getElementById('cam-btn-opacity-value');
      const fontColorPickerEl = document.getElementById('cam-btn-font-color-picker');
      const tapHintEl = document.getElementById('cam-tap-current-hint');
      if (colorPickerEl) colorPickerEl.value = '#000000';
      if (opacitySliderEl) opacitySliderEl.value = 100;
      if (opacityValueEl) opacityValueEl.textContent = '100%';
      if (fontColorPickerEl) fontColorPickerEl.value = '#ffffff';
      if (tapHintEl) tapHintEl.textContent = 'Current: Single Tap';
      updateCamTapHighlight('single');
      window._applyCamBtnStyles();
      localStorage.setItem('r1_cam_btn_settings', JSON.stringify(window._camBtnSettings));
    });
  }
  // ── End Main Camera Screen Settings ─────────────────────────────

  const viewerBtnColorPicker = document.getElementById('viewer-btn-color-picker');
  if (viewerBtnColorPicker) {
    viewerBtnColorPicker.addEventListener('input', (e) => {
      window._viewerBtnSettings.bgColor = e.target.value;
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerBtnOpacitySlider = document.getElementById('viewer-btn-opacity-slider');
  if (viewerBtnOpacitySlider) {
    viewerBtnOpacitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      window._viewerBtnSettings.opacity = val;
      const opacityValueEl = document.getElementById('viewer-btn-opacity-value');
      if (opacityValueEl) opacityValueEl.textContent = val + '%';
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerBtnColorDefaultBtn = document.getElementById('viewer-btn-color-default');
  if (viewerBtnColorDefaultBtn) {
    viewerBtnColorDefaultBtn.addEventListener('click', () => {
      window._viewerBtnSettings.bgColor = '#000000';
      window._viewerBtnSettings.opacity = 100;
      const colorPickerEl = document.getElementById('viewer-btn-color-picker');
      const opacitySliderEl = document.getElementById('viewer-btn-opacity-slider');
      const opacityValueEl = document.getElementById('viewer-btn-opacity-value');
      if (colorPickerEl) colorPickerEl.value = '#000000';
      if (opacitySliderEl) opacitySliderEl.value = 100;
      if (opacityValueEl) opacityValueEl.textContent = '100%';
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerBtnFontColorPicker = document.getElementById('viewer-btn-font-color-picker');
  if (viewerBtnFontColorPicker) {
    viewerBtnFontColorPicker.addEventListener('input', (e) => {
      window._viewerBtnSettings.fontColor = e.target.value;
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerBtnFontColorDefaultBtn = document.getElementById('viewer-btn-font-color-default');
  if (viewerBtnFontColorDefaultBtn) {
    viewerBtnFontColorDefaultBtn.addEventListener('click', () => {
      window._viewerBtnSettings.fontColor = '#ffffff';
      const fontColorPickerEl = document.getElementById('viewer-btn-font-color-picker');
      if (fontColorPickerEl) fontColorPickerEl.value = '#ffffff';
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerTapSingleBtn = document.getElementById('viewer-tap-single');
  if (viewerTapSingleBtn) {
    viewerTapSingleBtn.addEventListener('click', () => {
      window._viewerBtnSettings.tapMode = 'single';
      const tapHintEl = document.getElementById('viewer-tap-current-hint');
      if (tapHintEl) tapHintEl.textContent = 'Current: Single Tap';
      updateViewerTapHighlight('single');
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerTapDoubleBtn = document.getElementById('viewer-tap-double');
  if (viewerTapDoubleBtn) {
    viewerTapDoubleBtn.addEventListener('click', () => {
      window._viewerBtnSettings.tapMode = 'double';
      const tapHintEl = document.getElementById('viewer-tap-current-hint');
      if (tapHintEl) tapHintEl.textContent = 'Current: Double Tap';
      updateViewerTapHighlight('double');
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }

  const viewerScreenResetAllBtn = document.getElementById('viewer-screen-reset-all');
  if (viewerScreenResetAllBtn) {
    viewerScreenResetAllBtn.addEventListener('click', () => {
      window._viewerBtnSettings = { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'single' };
      const colorPickerEl = document.getElementById('viewer-btn-color-picker');
      const opacitySliderEl = document.getElementById('viewer-btn-opacity-slider');
      const opacityValueEl = document.getElementById('viewer-btn-opacity-value');
      const fontColorPickerEl = document.getElementById('viewer-btn-font-color-picker');
      const tapHintEl = document.getElementById('viewer-tap-current-hint');
      if (colorPickerEl) colorPickerEl.value = '#000000';
      if (opacitySliderEl) opacitySliderEl.value = 100;
      if (opacityValueEl) opacityValueEl.textContent = '100%';
      if (fontColorPickerEl) fontColorPickerEl.value = '#ffffff';
      if (tapHintEl) tapHintEl.textContent = 'Current: Single Tap';
      updateViewerTapHighlight('single');
      window._applyViewerBtnStyles();
      localStorage.setItem('r1_viewer_btn_settings', JSON.stringify(window._viewerBtnSettings));
    });
  }
  // ── End Gallery Image Viewer Screen Settings ─────────────────────────────

  const aspectRatioSettingsBtn = document.getElementById('aspect-ratio-settings-button');
  if (aspectRatioSettingsBtn) {
    aspectRatioSettingsBtn.addEventListener('click', showAspectRatioSubmenu);
  }
  
  const aspectRatioBackBtn = document.getElementById('aspect-ratio-back');
  if (aspectRatioBackBtn) {
    aspectRatioBackBtn.addEventListener('click', hideAspectRatioSubmenu);
  }
  
  // Aspect ratio checkboxes - make them mutually exclusive
  const aspectRatio1_1 = document.getElementById('aspect-ratio-1-1');
  const aspectRatio16_9 = document.getElementById('aspect-ratio-16-9');
  
  if (aspectRatio1_1) {
    aspectRatio1_1.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedAspectRatio = '1:1';
        if (aspectRatio16_9) aspectRatio16_9.checked = false;
      } else {
        selectedAspectRatio = 'none';
      }
      saveMasterPrompt();
      updateAspectRatioDisplay();
    });
  }
  
  if (aspectRatio16_9) {
    aspectRatio16_9.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedAspectRatio = '16:9';
        if (aspectRatio1_1) aspectRatio1_1.checked = false;
      } else {
        selectedAspectRatio = 'none';
      }
      saveMasterPrompt();
      updateAspectRatioDisplay();
    });
  }


  const visiblePresetsSettingsBtn = document.getElementById('visible-presets-settings-button');
  if (visiblePresetsSettingsBtn) {
    visiblePresetsSettingsBtn.addEventListener('click', showVisiblePresetsSubmenu);
  }
  
  const visiblePresetsBackBtn = document.getElementById('visible-presets-back');
  if (visiblePresetsBackBtn) {
    visiblePresetsBackBtn.addEventListener('click', hideVisiblePresetsSubmenu);
  }

  // Preset Builder
  const presetBuilderBtn = document.getElementById('preset-builder-button');
  if (presetBuilderBtn) {
    presetBuilderBtn.addEventListener('click', showPresetBuilderSubmenu);
  }
  
  const presetBuilderBack = document.getElementById('preset-builder-back');
  if (presetBuilderBack) {
    presetBuilderBack.addEventListener('click', hidePresetBuilderSubmenu);
  }
  
  // Enable scroll for preset builder
  const presetBuilderJumpUp = document.getElementById('preset-builder-jump-up');
  if (presetBuilderJumpUp) {
    presetBuilderJumpUp.addEventListener('click', scrollPresetBuilderUp);
  }
  
  const presetBuilderJumpDown = document.getElementById('preset-builder-jump-down');
  if (presetBuilderJumpDown) {
    presetBuilderJumpDown.addEventListener('click', scrollPresetBuilderDown);
  }
  
  const presetBuilderTemplate = document.getElementById('preset-builder-template');
  if (presetBuilderTemplate) {
    presetBuilderTemplate.addEventListener('change', handleTemplateSelection);
  }
  
  // Handle Enter key navigation in preset builder
  const presetBuilderName = document.getElementById('preset-builder-name');
  if (presetBuilderName) {
    presetBuilderName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('preset-builder-category')?.focus();
      }
    });
  }
  
  const presetBuilderCategory = document.getElementById('preset-builder-category');
  const categoryAutocomplete = document.getElementById('category-autocomplete');
  
  if (presetBuilderCategory && categoryAutocomplete) {
    // Show autocomplete suggestions
    const showCategorySuggestions = () => {
      const inputValue = presetBuilderCategory.value;
      const lastComma = inputValue.lastIndexOf(',');
      const currentCategory = (lastComma >= 0 ? inputValue.substring(lastComma + 1) : inputValue).trim().toUpperCase();
      
      const allCategories = getAllCategories();
      const filteredCategories = currentCategory 
        ? allCategories.filter(cat => cat.includes(currentCategory))
        : allCategories;
      
      if (filteredCategories.length > 0) {
        categoryAutocomplete.innerHTML = filteredCategories
          .map(cat => `<div class="category-autocomplete-item" data-category="${cat}">${cat}</div>`)
          .join('');
        categoryAutocomplete.style.display = 'block';
      } else {
        categoryAutocomplete.style.display = 'none';
      }
    };
    
    // Insert selected category
    const insertCategory = (category) => {
      const inputValue = presetBuilderCategory.value;
      const lastComma = inputValue.lastIndexOf(',');
      
      if (lastComma >= 0) {
        // Replace the last category after the comma
        presetBuilderCategory.value = inputValue.substring(0, lastComma + 1) + ' ' + category + ', ';
      } else {
        // Replace entire input
        presetBuilderCategory.value = category + ', ';
      }
      
      categoryAutocomplete.style.display = 'none';
      presetBuilderCategory.focus();
    };
    
    // Show suggestions on input
    presetBuilderCategory.addEventListener('input', showCategorySuggestions);
    
    // Show suggestions on focus
    presetBuilderCategory.addEventListener('focus', showCategorySuggestions);
    
    // Handle clicking on autocomplete items
    categoryAutocomplete.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-autocomplete-item')) {
        const category = e.target.getAttribute('data-category');
        insertCategory(category);
      }
    });
    
    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!presetBuilderCategory.contains(e.target) && !categoryAutocomplete.contains(e.target)) {
        categoryAutocomplete.style.display = 'none';
      }
    });
    
    // Handle Enter key
    presetBuilderCategory.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        categoryAutocomplete.style.display = 'none';
        document.getElementById('preset-builder-template')?.focus();
      }
    });
  }
  
  const presetBuilderSave = document.getElementById('preset-builder-save');
  if (presetBuilderSave) {
    presetBuilderSave.addEventListener('click', saveCustomPreset);
  }
  
  const presetBuilderClear = document.getElementById('preset-builder-clear');
  if (presetBuilderClear) {
    presetBuilderClear.addEventListener('click', clearPresetBuilderForm);
  }

  const presetBuilderDelete = document.getElementById('preset-builder-delete');
  if (presetBuilderDelete) {
    presetBuilderDelete.addEventListener('click', deleteCustomPreset);
  }

  // Style Editor option fields
  const styleRandomizeEl = document.getElementById('style-randomize');
  if (styleRandomizeEl) {
    styleRandomizeEl.addEventListener('change', toggleStyleRandomizeOptions);
  }
  const styleSelectionTypeEl = document.getElementById('style-selection-type');
  if (styleSelectionTypeEl) {
    styleSelectionTypeEl.addEventListener('change', updateStyleSelectionTypeVisibility);
  }
  const styleAddSingleBtn = document.getElementById('style-add-single-option');
  if (styleAddSingleBtn) {
    styleAddSingleBtn.addEventListener('click', () => addStyleSingleOption());
  }
  const styleAddGroupBtn = document.getElementById('style-add-option-group');
  if (styleAddGroupBtn) {
    styleAddGroupBtn.addEventListener('click', () => addStyleOptionGroup());
  }

  // Preset Builder - Randomize options checkbox
  const randomizeCheckboxEl = document.getElementById('preset-builder-randomize');
  if (randomizeCheckboxEl) {
    randomizeCheckboxEl.addEventListener('change', toggleRandomizeOptions);
  }
  
  // Preset Builder - Selection type dropdown
  const selectionTypeSelectEl = document.getElementById('preset-builder-selection-type');
  if (selectionTypeSelectEl) {
    selectionTypeSelectEl.addEventListener('change', updateSelectionTypeVisibility);
  }
  
  // Preset Builder - Add single option button
  const addSingleOptionBtn = document.getElementById('add-single-option');
  if (addSingleOptionBtn) {
    addSingleOptionBtn.addEventListener('click', () => addSingleOption());
  }
  
  // Preset Builder - Add option group button
  const addOptionGroupBtn = document.getElementById('add-option-group');
  if (addOptionGroupBtn) {
    addOptionGroupBtn.addEventListener('click', () => addOptionGroup());
  }

  // Collapsible chip sections
  const chipSectionHeaders = document.querySelectorAll('.chip-section-header');
  chipSectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.getAttribute('data-section');
      const content = document.getElementById('section-' + section);
      const isExpanded = content.style.display === 'block';
      
      // Close all sections
      document.querySelectorAll('.chip-section-content').forEach(c => {
        c.style.display = 'none';
      });
      document.querySelectorAll('.chip-section-header').forEach(h => {
        h.classList.remove('expanded');
      });
      
      // Toggle current section
      if (!isExpanded) {
        content.style.display = 'block';
        header.classList.add('expanded');
      }
    });
  });

  // Preset Builder chip buttons
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      const textToAdd = e.target.getAttribute('data-text');
      const promptTextarea = document.getElementById('preset-builder-prompt');
      const currentText = promptTextarea.value;
      
      // Add text at the end
      if (currentText.trim()) {
        promptTextarea.value = currentText + ' ' + textToAdd;
      } else {
        promptTextarea.value = textToAdd;
      }
      
      // Scroll to bottom of textarea
      promptTextarea.scrollTop = promptTextarea.scrollHeight;
    });
  });
  
   // Quality dropdown
  const qualitySelect = document.getElementById('preset-builder-quality');
  if (qualitySelect) {
    qualitySelect.addEventListener('change', (e) => {
      const textToAdd = e.target.value;
      if (textToAdd) {
        const promptTextarea = document.getElementById('preset-builder-prompt');
        const currentText = promptTextarea.value;
        
        if (currentText.trim()) {
          promptTextarea.value = currentText + ' ' + textToAdd;
        } else {
          promptTextarea.value = textToAdd;
        }
        
        // Reset dropdown
        e.target.value = '';
        promptTextarea.scrollTop = promptTextarea.scrollHeight;
      }
    });
  }

  const visiblePresetsSelectAll = document.getElementById('visible-presets-select-all');
  if (visiblePresetsSelectAll) {
    visiblePresetsSelectAll.addEventListener('click', () => {
      const allPresets = CAMERA_PRESETS.filter(p => !p.internal);
      visiblePresets = allPresets.map(p => p.name);
      saveVisiblePresets();
      populateVisiblePresetsList();
      updateVisiblePresetsDisplay();
    });
  }
  
  const visiblePresetsDeselectAll = document.getElementById('visible-presets-deselect-all');
  if (visiblePresetsDeselectAll) {
    visiblePresetsDeselectAll.addEventListener('click', () => {
      visiblePresets = [];
      saveVisiblePresets();
      populateVisiblePresetsList();
      updateVisiblePresetsDisplay();
    });
  }
  
  const visiblePresetsJumpUp = document.getElementById('visible-presets-jump-up');
  if (visiblePresetsJumpUp) {
    let vpUpTapTimer = null;
    visiblePresetsJumpUp.addEventListener('click', () => {
      if (vpUpTapTimer) {
        // Double-tap: jump to very top
        clearTimeout(vpUpTapTimer);
        vpUpTapTimer = null;
        currentVisiblePresetsIndex = 0;
        updateVisiblePresetsSelection();
      } else {
        vpUpTapTimer = setTimeout(() => {
          vpUpTapTimer = null;
          // Single-tap: page up
          const submenu = document.getElementById('visible-presets-submenu');
          if (submenu) {
            const container = submenu.querySelector('.submenu-list');
            if (container) {
              container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight);
            }
          }
        }, 300);
      }
    });
  }

  const visiblePresetsJumpDown = document.getElementById('visible-presets-jump-down');
  if (visiblePresetsJumpDown) {
    let vpDownTapTimer = null;
    visiblePresetsJumpDown.addEventListener('click', () => {
      if (vpDownTapTimer) {
        // Double-tap: jump to very bottom
        clearTimeout(vpDownTapTimer);
        vpDownTapTimer = null;
        const list = document.getElementById('visible-presets-list');
        if (list) {
          const items = list.querySelectorAll('.style-item');
          if (items.length > 0) {
            currentVisiblePresetsIndex = items.length - 1;
            updateVisiblePresetsSelection();
          }
        }
      } else {
        vpDownTapTimer = setTimeout(() => {
          vpDownTapTimer = null;
          // Single-tap: page down
          const submenu = document.getElementById('visible-presets-submenu');
          if (submenu) {
            const container = submenu.querySelector('.submenu-list');
            if (container) {
              container.scrollTop = Math.min(
                container.scrollHeight - container.clientHeight,
                container.scrollTop + container.clientHeight
              );
            }
          }
        }, 300);
      }
    });
  }

// ========== IMAGE EDITOR FUNCTIONALITY ==========
let editorCanvas = null;
let editorCtx = null;
let editorOriginalImage = null;
let editorCurrentImage = null;
let editorHistory = [];
let editorCurrentRotation = 0;
let editorBrightness = 0;
let editorContrast = 0;
let isCropMode = false;
let cropPoint1 = null;
let cropPoint2 = null;

// Open image editor
function openImageEditor() {
  const imageToEdit = galleryImages[currentViewerImageIndex];
  if (!imageToEdit) return;
  
  // Hide viewer, show editor
  document.getElementById('image-viewer').style.display = 'none';
  document.getElementById('image-editor-modal').style.display = 'flex';
  
  // Initialize canvas
  editorCanvas = document.getElementById('editor-canvas');
  editorCtx = editorCanvas.getContext('2d', { willReadFrequently: true });
  
  // Load image
  const img = new Image();
  img.onload = () => {
    editorOriginalImage = img;
    editorCurrentImage = img;
    editorHistory = [];
    editorCurrentRotation = 0;
    editorBrightness = 0;
    editorContrast = 0;
    
    // Reset sliders
    document.getElementById('brightness-slider').value = 0;
    document.getElementById('contrast-slider').value = 0;
    document.getElementById('brightness-value').textContent = '0';
    document.getElementById('contrast-value').textContent = '0';
    
    renderEditorImage();
    updateUndoButton();
  };
  img.src = imageToEdit.imageBase64;
}

// Render current image to canvas
function renderEditorImage() {
  if (!editorCurrentImage || !editorCanvas) return;
  
  // CRITICAL: Keep canvas at ORIGINAL resolution - don't downscale!
  // Canvas dimensions = actual image dimensions
  editorCanvas.width = editorCurrentImage.width;
  editorCanvas.height = editorCurrentImage.height;
  
  // Clear canvas
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  
  // Draw image at FULL original resolution
  editorCtx.drawImage(editorCurrentImage, 0, 0);
  
  // Apply brightness and contrast
  if (editorBrightness !== 0 || editorContrast !== 0) {
    applyBrightnessContrast();
  }
  
  // Let CSS handle the display scaling (canvas will auto-scale to fit container)
  // The .editor-canvas CSS already has max-width: 100%; max-height: 100%;
}

// Apply brightness and contrast
function applyBrightnessContrast() {
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  
  const brightness = editorBrightness;
  const contrast = (editorContrast + 100) / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast
    data[i] = ((data[i] / 255 - 0.5) * contrast + 0.5) * 255;
    data[i + 1] = ((data[i + 1] / 255 - 0.5) * contrast + 0.5) * 255;
    data[i + 2] = ((data[i + 2] / 255 - 0.5) * contrast + 0.5) * 255;
    
    // Apply brightness
    data[i] += brightness;
    data[i + 1] += brightness;
    data[i + 2] += brightness;
    
    // Clamp values
    data[i] = Math.max(0, Math.min(255, data[i]));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]));
  }
  
  editorCtx.putImageData(imageData, 0, 0);
}

// Rotate image
function rotateImage() {
  saveToHistory();
  
  editorCurrentRotation = (editorCurrentRotation + 90) % 360;
  
  // Create temporary canvas for rotation
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  
  // Swap width/height for 90° or 270° rotations
  if (editorCurrentRotation === 90 || editorCurrentRotation === 270) {
    tempCanvas.width = editorCurrentImage.height;
    tempCanvas.height = editorCurrentImage.width;
  } else {
    tempCanvas.width = editorCurrentImage.width;
    tempCanvas.height = editorCurrentImage.height;
  }
  
  // Perform rotation
  tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
  tempCtx.rotate((editorCurrentRotation * Math.PI) / 180);
  tempCtx.drawImage(editorCurrentImage, -editorCurrentImage.width / 2, -editorCurrentImage.height / 2);
  
  // Create new image from rotated canvas
  const rotatedImg = new Image();
  rotatedImg.onload = () => {
    editorCurrentImage = rotatedImg;
    renderEditorImage();
  };
  rotatedImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

// Sharpen image
function sharpenImage() {
  saveToHistory();
  
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  const width = editorCanvas.width;
  const height = editorCanvas.height;
  
  // Create output array
  const output = new Uint8ClampedArray(data);
  
  // Sharpening kernel (3x3)
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  // Apply convolution
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) { // RGB channels only
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            sum += data[pixelIndex] * kernel[kernelIndex];
          }
        }
        output[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, sum));
      }
    }
  }
  
  // Copy output back to imageData
  for (let i = 0; i < data.length; i += 4) {
    data[i] = output[i];
    data[i + 1] = output[i + 1];
    data[i + 2] = output[i + 2];
  }
  
  editorCtx.putImageData(imageData, 0, 0);
  
  // Save current canvas as new image
  const newImg = new Image();
  newImg.onload = () => {
    editorCurrentImage = newImg;
    renderEditorImage();
  };
  newImg.src = editorCanvas.toDataURL('image/jpeg', 0.95);
}

// Auto-correct (simple enhancement)
function autoCorrect() {
  saveToHistory();
  
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  
  // Simple auto-enhance: increase contrast and saturation slightly
  const contrast = 1.15;
  const saturation = 1.2;
  const brightness = 5;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Apply contrast
    r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
    
    // Apply saturation
    const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
    r = gray + saturation * (r - gray);
    g = gray + saturation * (g - gray);
    b = gray + saturation * (b - gray);
    
    // Apply brightness
    r += brightness;
    g += brightness;
    b += brightness;
    
    // Clamp values
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  
  editorCtx.putImageData(imageData, 0, 0);
  
  // Save current canvas as new image
  const newImg = new Image();
  newImg.onload = () => {
    editorCurrentImage = newImg;
    renderEditorImage();
  };
  newImg.src = editorCanvas.toDataURL('image/jpeg', 0.95);
}

// Enter crop mode
function enterCropMode() {
  isCropMode = !isCropMode;
  const cropOverlay = document.getElementById('crop-overlay');
  const cropButton = document.getElementById('crop-button');
  
  if (isCropMode) {
    cropOverlay.style.display = 'block';
    cropButton.classList.add('active');
    cropPoint1 = null;
    cropPoint2 = null;
    
    // Reset crop corners to default positions
    const container = document.querySelector('.editor-image-container');
    const containerRect = container.getBoundingClientRect();
    const canvasRect = editorCanvas.getBoundingClientRect();
    
    const topLeft = document.querySelector('.crop-top-left');
    const bottomRight = document.querySelector('.crop-bottom-right');
    
    topLeft.style.left = ((canvasRect.left - containerRect.left) + canvasRect.width * 0.1) + 'px';
    topLeft.style.top = ((canvasRect.top - containerRect.top) + canvasRect.height * 0.1) + 'px';
    
    bottomRight.style.right = (containerRect.right - canvasRect.right + canvasRect.width * 0.1) + 'px';
    bottomRight.style.bottom = (containerRect.bottom - canvasRect.bottom + canvasRect.height * 0.1) + 'px';
    
  } else {
    cropOverlay.style.display = 'none';
    cropButton.classList.remove('active');
  }
}

// Perform crop
function performCrop() {
  if (!isCropMode) return;
  
  saveToHistory();
  
  const container = document.querySelector('.editor-image-container');
  const containerRect = container.getBoundingClientRect();
  const canvasRect = editorCanvas.getBoundingClientRect();
  
  const topLeft = document.querySelector('.crop-top-left');
  const bottomRight = document.querySelector('.crop-bottom-right');
  
  const topLeftRect = topLeft.getBoundingClientRect();
  const bottomRightRect = bottomRight.getBoundingClientRect();
  
  // Calculate crop coordinates relative to canvas
  const x1 = topLeftRect.left - canvasRect.left;
  const y1 = topLeftRect.top - canvasRect.top;
  const x2 = bottomRightRect.right - canvasRect.left;
  const y2 = bottomRightRect.bottom - canvasRect.top;
  
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;
  
  if (cropWidth <= 0 || cropHeight <= 0) {
    alert('Invalid crop area');
    return;
  }
  
  // Create cropped image
  const scaleX = editorCurrentImage.width / canvasRect.width;
  const scaleY = editorCurrentImage.height / canvasRect.height;
  
  const sourceX = x1 * scaleX;
  const sourceY = y1 * scaleY;
  const sourceWidth = cropWidth * scaleX;
  const sourceHeight = cropHeight * scaleY;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceWidth;
  tempCanvas.height = sourceHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  tempCtx.drawImage(
    editorCurrentImage,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, sourceWidth, sourceHeight
  );
  
  // Create new image from cropped canvas
  const croppedImg = new Image();
  croppedImg.onload = () => {
    editorCurrentImage = croppedImg;
    isCropMode = false;
    document.getElementById('crop-overlay').style.display = 'none';
    document.getElementById('crop-button').classList.remove('active');
    renderEditorImage();
  };
  croppedImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

// Save current state to history
function saveToHistory() {
  const historyItem = {
    image: editorCurrentImage,
    rotation: editorCurrentRotation,
    brightness: editorBrightness,
    contrast: editorContrast
  };
  editorHistory.push(historyItem);
  updateUndoButton();
}

// Undo last action
function undoEdit() {
  if (editorHistory.length === 0) return;
  
  const previousState = editorHistory.pop();
  editorCurrentImage = previousState.image;
  editorCurrentRotation = previousState.rotation;
  editorBrightness = previousState.brightness;
  editorContrast = previousState.contrast;
  
  document.getElementById('brightness-slider').value = editorBrightness;
  document.getElementById('contrast-slider').value = editorContrast;
  document.getElementById('brightness-value').textContent = editorBrightness;
  document.getElementById('contrast-value').textContent = editorContrast;
  
  renderEditorImage();
  updateUndoButton();
}

// Update undo button state
function updateUndoButton() {
  const undoButton = document.getElementById('undo-edit-button');
  undoButton.disabled = editorHistory.length === 0;
}

// Save edited image
async function saveEditedImage() {
  // Get final canvas with all adjustments
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = editorCanvas.width;
  finalCanvas.height = editorCanvas.height;
  const finalCtx = finalCanvas.getContext('2d');
  
  // Copy current canvas
  finalCtx.drawImage(editorCanvas, 0, 0);
  
  // Convert to base64
  const editedBase64 = finalCanvas.toDataURL('image/jpeg', 0.9);
  
  // Create new image entry
  const newImageData = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    imageBase64: editedBase64,
    timestamp: Date.now()
  };
  
  // Add to gallery
  galleryImages.unshift(newImageData);
  await saveImageToDB(newImageData);
  
  // Update the viewer to show the NEW edited image
  currentViewerImageIndex = 0; // The new image is now at index 0
  const viewerImg = document.getElementById('viewer-image');
  viewerImg.src = editedBase64;
  viewerImg.style.transform = 'scale(1) translate(0, 0)';
  viewerZoom = 1;
  
  // Close editor
  closeImageEditor();
  
  // Refresh gallery
  await showGallery(true);
  showGalleryStatusMessage('Edited image saved!', 'success', 3000);
}

// Close image editor
function closeImageEditor() {
  document.getElementById('image-editor-modal').style.display = 'none';
  document.getElementById('image-viewer').style.display = 'flex';
  
  // Reset crop mode
  isCropMode = false;
  document.getElementById('crop-overlay').style.display = 'none';
  document.getElementById('crop-button').classList.remove('active');
}

// Event listeners for image editor
document.getElementById('edit-viewer-image')?.addEventListener('click', openImageEditor);
document.getElementById('close-image-editor')?.addEventListener('click', closeImageEditor);
document.getElementById('rotate-button')?.addEventListener('click', rotateImage);
document.getElementById('sharpen-button')?.addEventListener('click', sharpenImage);
document.getElementById('autocorrect-button')?.addEventListener('click', autoCorrect);
document.getElementById('undo-edit-button')?.addEventListener('click', undoEdit);
document.getElementById('save-edit-button')?.addEventListener('click', saveEditedImage);

// Crop button toggles crop mode, then applies crop on second click
let cropClickCount = 0;
document.getElementById('crop-button')?.addEventListener('click', () => {
  if (!isCropMode) {
    enterCropMode();
    cropClickCount = 0;
  } else {
    performCrop();
  }
});

// Brightness slider
document.getElementById('brightness-slider')?.addEventListener('input', (e) => {
  editorBrightness = parseInt(e.target.value);
  document.getElementById('brightness-value').textContent = editorBrightness;
  renderEditorImage();
});

// Contrast slider
document.getElementById('contrast-slider')?.addEventListener('input', (e) => {
  editorContrast = parseInt(e.target.value);
  document.getElementById('contrast-value').textContent = editorContrast;
  renderEditorImage();
});

// Drag crop corners
let draggedCorner = null;

document.querySelectorAll('.crop-corner').forEach(corner => {
  corner.addEventListener('touchstart', (e) => {
    e.preventDefault();
    draggedCorner = corner;
  });
});

document.addEventListener('touchmove', (e) => {
  if (!draggedCorner || !isCropMode) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const container = document.querySelector('.editor-image-container');
  const containerRect = container.getBoundingClientRect();
  const canvasRect = editorCanvas.getBoundingClientRect();
  
  // Calculate position relative to container
  let x = touch.clientX - containerRect.left;
  let y = touch.clientY - containerRect.top;
  
  // Get canvas boundaries relative to container
  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const canvasRight = canvasRect.right - containerRect.left;
  const canvasBottom = canvasRect.bottom - containerRect.top;
  
  // Get corner size
  const cornerSize = draggedCorner.offsetWidth;
  
  if (draggedCorner.classList.contains('crop-top-left')) {
    // Clamp to canvas boundaries
    x = Math.max(canvasLeft, Math.min(x, canvasRight - cornerSize));
    y = Math.max(canvasTop, Math.min(y, canvasBottom - cornerSize));
    
    // Also ensure it doesn't go past bottom-right corner
    const bottomRight = document.querySelector('.crop-bottom-right');
    const bottomRightRect = bottomRight.getBoundingClientRect();
    const maxX = bottomRightRect.right - containerRect.left - cornerSize * 2;
    const maxY = bottomRightRect.bottom - containerRect.top - cornerSize * 2;
    
    x = Math.min(x, maxX);
    y = Math.min(y, maxY);
    
    draggedCorner.style.left = x + 'px';
    draggedCorner.style.top = y + 'px';
    
  } else if (draggedCorner.classList.contains('crop-bottom-right')) {
    // Clamp to canvas boundaries
    x = Math.max(canvasLeft + cornerSize, Math.min(x, canvasRight));
    y = Math.max(canvasTop + cornerSize, Math.min(y, canvasBottom));
    
    // Also ensure it doesn't go past top-left corner
    const topLeft = document.querySelector('.crop-top-left');
    const topLeftRect = topLeft.getBoundingClientRect();
    const minX = topLeftRect.right - containerRect.left + cornerSize;
    const minY = topLeftRect.bottom - containerRect.top + cornerSize;
    
    x = Math.max(x, minX);
    y = Math.max(y, minY);
    
    draggedCorner.style.right = (containerRect.width - x) + 'px';
    draggedCorner.style.bottom = (containerRect.height - y) + 'px';
  }
});

document.addEventListener('touchend', () => {
  draggedCorner = null;
});

// ========== END IMAGE EDITOR ==========

  // White Balance Settings - COMMENTED OUT
  // const whiteBalanceSettingsBtn = document.getElementById('white-balance-settings-button');
  // if (whiteBalanceSettingsBtn) {
  //   whiteBalanceSettingsBtn.addEventListener('click', showWhiteBalanceSubmenu);
  // }
  
  // const whiteBalanceBackBtn = document.getElementById('white-balance-back');
  // if (whiteBalanceBackBtn) {
  //   whiteBalanceBackBtn.addEventListener('click', hideWhiteBalanceSubmenu);
  // }

  const noMagicToggleBtn = document.getElementById('no-magic-toggle-button');
  if (noMagicToggleBtn) {
    noMagicToggleBtn.addEventListener('click', toggleNoMagicMode);
  }
  const tutorialBtn = document.getElementById('tutorial-button');
  if (tutorialBtn) {
    tutorialBtn.addEventListener('click', showTutorialSubmenu);
  }
  
  const tutorialBackBtn = document.getElementById('tutorial-back');
  if (tutorialBackBtn) {
    tutorialBackBtn.addEventListener('click', hideTutorialSubmenu);
  }
  
// Import presets button handler
  const importPresetsBtn = document.getElementById('import-presets-button');
  if (importPresetsBtn) {
    importPresetsBtn.addEventListener('click', async () => {
      try {
        showLoadingOverlay('Loading presets...');
        // Wait one frame so the browser actually paints the spinner before the heavy work starts
        await new Promise(resolve => setTimeout(resolve, 30));
const result = await presetImporter.import();
        
        if (result.success) {
          // Save preset names that existed BEFORE import (to detect truly new presets)
          const presetsBeforeImport = new Set(CAMERA_PRESETS.map(p => p.name));
          
          // Reload presets (merges imported + modifications)
          CAMERA_PRESETS = await mergePresetsWithStorage();
          
          // Clean up visible presets after reloading and add only NEW presets
          const validPresetNames = new Set(CAMERA_PRESETS.map(p => p.name));
          
          // Keep existing visible presets that are still valid
          visiblePresets = visiblePresets.filter(name => validPresetNames.has(name));
          
          // Add ONLY truly NEW presets (ones that didn't exist before import) as visible by default
          CAMERA_PRESETS.forEach(preset => {
            if (!presetsBeforeImport.has(preset.name) && !visiblePresets.includes(preset.name)) {
              visiblePresets.push(preset.name);
            }
          });
          
          saveVisiblePresets();
          
          // Update menu display
                    updateVisiblePresetsDisplay();
          
          // Update styles count
          const stylesCountElement = document.getElementById('styles-count');
          if (stylesCountElement) {
            const visibleCount = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name)).length;
            stylesCountElement.textContent = visibleCount;
          }

          // Re-check accurately how many updates remain after import
          await recheckForUpdates();
          
          alert(result.message);
        } else if (result.message !== 'cancelled' && result.message !== 'No presets selected') {
          alert('Import failed: ' + result.message);
        }
      } catch (error) {
        alert('Import error: ' + error.message);
      }
    });
  }

  // Glossary navigation
  const glossaryItems = document.querySelectorAll('.glossary-item');
  glossaryItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      showTutorialSection(sectionId);
    });
  });
  
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  if (backToGlossaryBtn) {
    backToGlossaryBtn.addEventListener('click', showTutorialGlossary);
  }

  // Tutorial search wiring
  const tutSearchInput = document.getElementById('tutorial-search-input');
  if (tutSearchInput) {
    let tutSearchDebounce = null;
    tutSearchInput.addEventListener('input', () => {
      if (tutSearchDebounce) clearTimeout(tutSearchDebounce);
      tutSearchDebounce = setTimeout(tutorialSearchRun, 200);
    });
  }
  const tutSearchNext = document.getElementById('tutorial-search-next');
  if (tutSearchNext) tutSearchNext.addEventListener('click', tutorialSearchNext);
  const tutSearchPrev = document.getElementById('tutorial-search-prev');
  if (tutSearchPrev) tutSearchPrev.addEventListener('click', tutorialSearchPrev);
  // × button: first click dismisses keyboard, second click clears search

  const tutSearchBlur = document.getElementById('tutorial-search-blur');
  if (tutSearchBlur && tutSearchInput) {
    let tutBlurClickCount = 0;
    let tutBlurClickTimer = null;
    tutSearchBlur.addEventListener('click', () => {
      tutBlurClickCount++;
      if (tutBlurClickCount === 1) {
        tutSearchInput.blur();
        tutBlurClickTimer = setTimeout(() => { tutBlurClickCount = 0; }, 1000);
      } else {
        clearTimeout(tutBlurClickTimer);
        tutBlurClickCount = 0;
        tutSearchInput.value = '';
        tutorialSearchClear();
      }
    });
  }

  const startTourBtn = document.getElementById('start-guided-tour');
  if (startTourBtn) {
    startTourBtn.addEventListener('click', startGuidedTour);
    startTourBtn.addEventListener('touchend', (e) => { e.preventDefault(); startGuidedTour(); });
  }

  const tourSkipBtn = document.getElementById('tour-btn-skip');
  if (tourSkipBtn) {
    tourSkipBtn.addEventListener('click', endGuidedTour);
    tourSkipBtn.addEventListener('touchend', (e) => { e.preventDefault(); endGuidedTour(); });
  }

  const tourBackBtn = document.getElementById('tour-btn-back');
  if (tourBackBtn) {
    tourBackBtn.addEventListener('click', tourBack);
    tourBackBtn.addEventListener('touchend', (e) => { e.preventDefault(); tourBack(); });
  }

  const tourNextBtn = document.getElementById('tour-btn-next');
  if (tourNextBtn) {
    tourNextBtn.addEventListener('click', tourNext);
    tourNextBtn.addEventListener('touchend', (e) => { e.preventDefault(); tourNext(); });
  }  

  const masterPromptCheckbox = document.getElementById('master-prompt-enabled');
  if (masterPromptCheckbox) {
    masterPromptCheckbox.addEventListener('change', (e) => {
      masterPromptEnabled = e.target.checked;
      const textarea = document.getElementById('master-prompt-text');
      if (textarea) {
        textarea.disabled = !masterPromptEnabled;
      }
      saveMasterPrompt();
      
      // Update main screen indicator
      const mpIndicator = document.getElementById('master-prompt-indicator');
      if (mpIndicator) {
        mpIndicator.style.display = masterPromptEnabled ? 'block' : 'none';
      }

      updateMasterPromptDisplay();
      // Sync camera left carousel MP button color
      const camMpBtnChk = document.getElementById('cam-master-prompt-btn');
      if (camMpBtnChk) {
        if (masterPromptEnabled) camMpBtnChk.classList.add('enabled');
        else camMpBtnChk.classList.remove('enabled');
      }
    });
  }
  
  const masterPromptTextarea = document.getElementById('master-prompt-text');
  if (masterPromptTextarea) {
    masterPromptTextarea.addEventListener('input', async (e) => {
      masterPromptText = e.target.value;
      const charCount = document.getElementById('master-prompt-char-count');
      if (charCount) {
        charCount.textContent = masterPromptText.length;
      }
      saveMasterPrompt();
      updateMasterPromptDisplay();

      if (masterPromptText.trim().toLowerCase() === 'j3ss3') {
          try {
          const allAvailable = await presetImporter.loadPresetsFromFile();
          const wasActivated = unlockAllPresets(allAvailable);
          masterPromptTextarea.value = '';
          masterPromptText = '';
          saveMasterPrompt();
          updateMasterPromptDisplay();
          if (charCount) charCount.textContent = '0';
          if (wasActivated) {
            customAlert('🔓 All presets unlocked...cheater!');
          } else {
            customAlert('🔒 Be careful what you wish for.');
          }
        } catch (cheatErr) { /* non-critical */ }
      }
    });
  }

  loadNoMagicMode();
  loadImportResolution();

  const resetBtn = document.getElementById('reset-button');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToCamera);
  }
  
  const cameraBtn = document.getElementById('camera-button');
  if (cameraBtn) {
    cameraBtn.addEventListener('click', switchCamera);
  }
  
  const closeEditorBtn = document.getElementById('close-editor');
  if (closeEditorBtn) {
    closeEditorBtn.addEventListener('click', hideStyleEditor);
  }
  
  // Add scroll wheel support for style editor
//  const styleEditorBody = document.querySelector('.style-editor-body');
//  if (styleEditorBody) {
//    styleEditorBody.addEventListener('wheel', (e) => {
//      e.stopPropagation();
//      const delta = e.deltaY;
//      styleEditorBody.scrollTop += delta;
//    }, { passive: true });
//  }

  // Add scroll wheel support for style message textarea
//  const styleMessageTextarea = document.getElementById('style-message');
//  if (styleMessageTextarea) {
//    styleMessageTextarea.addEventListener('wheel', (e) => {
//      const atTop = styleMessageTextarea.scrollTop === 0;
//      const atBottom = styleMessageTextarea.scrollTop + styleMessageTextarea.clientHeight >= styleMessageTextarea.scrollHeight;
//    
    // Only allow scrolling within textarea if not at boundaries
//      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
//        e.stopPropagation();
//      }
//    }, { passive: true });
//  }

  const importResolutionBtn = document.getElementById('import-resolution-settings-button');
  if (importResolutionBtn) {
    importResolutionBtn.addEventListener('click', showImportResolutionSubmenu);
  }
  
  const importResolutionBackBtn = document.getElementById('import-resolution-back');
  if (importResolutionBackBtn) {
    importResolutionBackBtn.addEventListener('click', hideImportResolutionSubmenu);
  }
    
  const saveStyleBtn = document.getElementById('save-style');
  if (saveStyleBtn) {
    saveStyleBtn.addEventListener('click', saveStyle);
  }
  
  const deleteStyleBtn = document.getElementById('delete-style');
  if (deleteStyleBtn) {
    deleteStyleBtn.addEventListener('click', deleteStyle);
  }
  
  connectionStatusElement = document.getElementById('connection-status');
  queueStatusElement = document.getElementById('queue-status');
  syncButton = document.getElementById('sync-button');
  
  if (syncButton) {
    syncButton.addEventListener('click', syncQueuedPhotos);
  }
  
  if (queueStatusElement) {
    queueStatusElement.addEventListener('click', showQueueManager);
  }
  
  const closeQueueBtn = document.getElementById('close-queue-manager');
  if (closeQueueBtn) {
    closeQueueBtn.addEventListener('click', hideQueueManager);
  }
  
  const syncAllBtn = document.getElementById('sync-all');
  if (syncAllBtn) {
    syncAllBtn.addEventListener('click', syncQueuedPhotos);
  }
  
  const clearQueueBtn = document.getElementById('clear-queue');
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', clearQueue);
  }
  
  const galleryBtn = document.getElementById('gallery-button');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', showGallery);
  }
  
  const closeGalleryBtn = document.getElementById('close-gallery');
  if (closeGalleryBtn) {
    closeGalleryBtn.addEventListener('click', hideGallery);
  }
  
  // Gallery Import Button
  const galleryImportBtn = document.getElementById('gallery-import-button');
  if (galleryImportBtn) {
    galleryImportBtn.addEventListener('click', () => {
      openQRScannerModal();
    });
  }

  // Check for updates button handler
  const checkUpdatesBtn = document.getElementById('check-updates-button');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', async () => {
      try {
        showLoadingOverlay('Checking for updates...');
        // Load presets from JSON (uses cached copy if already loaded this session)
        const jsonPresets = await presetImporter.loadPresetsFromFile();
        hideLoadingOverlay();
        const importedPresets = presetImporter.getImportedPresets();
        
        if (importedPresets.length === 0) {
          alert('No presets imported yet. Use "Import Presets" first.');
          return;
        }
        
        // Check for updates and new presets
        let updatedCount = 0;
        let newCount = 0;
        
        const importedNames = new Set(importedPresets.map(p => p.name));
        
        jsonPresets.forEach(jsonPreset => {
          if (importedNames.has(jsonPreset.name)) {
            // Check if content is different (updated)
            const existing = importedPresets.find(p => p.name === jsonPreset.name);
            if (existing && existing.message !== jsonPreset.message) {
              updatedCount++;
            }
          } else {
            // New preset
            newCount++;
          }
        });
        
        if (updatedCount === 0 && newCount === 0) {
          alert('✅ All presets are up to date!');
          return;
        }
        
        // Show update prompt
        const updateMsg = [];
        if (updatedCount > 0) updateMsg.push(`${updatedCount} updated preset(s)`);
        if (newCount > 0) updateMsg.push(`${newCount} new preset(s)`);
        
        const shouldUpdate = await confirm(
          `Found ${updateMsg.join(' and ')} available.\n\n` +
          `Would you like to import updates now?`
        );
        
        if (shouldUpdate) {
          showLoadingOverlay('Loading presets...');
          // Wait one frame so the browser actually paints the spinner before the heavy work starts
          await new Promise(resolve => setTimeout(resolve, 30));
          // Trigger import with all presets selected
const result = await presetImporter.import();
          
          if (result.success) {
            // Save preset names that existed BEFORE import (to detect truly new presets)
            const presetsBeforeImport = new Set(CAMERA_PRESETS.map(p => p.name));
            
            // Reload presets
            CAMERA_PRESETS = await mergePresetsWithStorage();
            
            // Clean up visible presets after reloading and add only NEW presets
            const validPresetNames = new Set(CAMERA_PRESETS.map(p => p.name));
            
            // Keep existing visible presets that are still valid
            visiblePresets = visiblePresets.filter(name => validPresetNames.has(name));
            
            // Add ONLY truly NEW presets (ones that didn't exist before import) as visible by default
            CAMERA_PRESETS.forEach(preset => {
              if (!presetsBeforeImport.has(preset.name) && !visiblePresets.includes(preset.name)) {
                visiblePresets.push(preset.name);
              }
            });
            
            saveVisiblePresets();
            
            // Update menu
                        updateVisiblePresetsDisplay();
            
            // Re-check accurately how many updates remain after import
            await recheckForUpdates();
            
            alert(result.message);
          }
        }
      } catch (error) {
        alert('Error checking for updates: ' + error.message);
      }
    });
  }
  
  // QR Scanner Close Button
  const closeQRScannerBtn = document.getElementById('close-qr-scanner');
  if (closeQRScannerBtn) {
    closeQRScannerBtn.addEventListener('click', () => {
      closeQRScannerModal();
    });
  }

  const closeViewerBtn = document.getElementById('close-viewer');
  if (closeViewerBtn) {
    closeViewerBtn.addEventListener('click', closeImageViewer);
  }
  
  const backToCameraBtn = document.getElementById('viewer-back-to-camera');
  if (backToCameraBtn) {
    backToCameraBtn.addEventListener('click', () => {
      document.getElementById('image-viewer').style.display = 'none';
      document.getElementById('gallery-modal').style.display = 'none';
      currentViewerImageIndex = -1;
      viewerZoom = 1;
      window.viewerLoadedPreset = null;
      hideGallery();
    });
  }
  
  const deleteViewerBtn = document.getElementById('delete-viewer-image');
  if (deleteViewerBtn) {
    deleteViewerBtn.addEventListener('click', deleteViewerImage);
  }
  
  const uploadViewerBtn = document.getElementById('upload-viewer-image');
  if (uploadViewerBtn) {
    uploadViewerBtn.addEventListener('click', uploadViewerImage);
  }

  const mpViewerBtn = document.getElementById('mp-viewer-button');
  if (mpViewerBtn) {
    mpViewerBtn.addEventListener('click', () => {
      // Save current viewer image index
      savedViewerImageIndex = currentViewerImageIndex;
      
      // Close image viewer and gallery
      document.getElementById('image-viewer').style.display = 'none';
      document.getElementById('gallery-modal').style.display = 'none';
      
      // Set flag to return to gallery
      returnToGalleryFromMasterPrompt = true;
      
      // Open settings submenu first
      document.getElementById('unified-menu').style.display = 'flex';
      isMenuOpen = true;
      document.getElementById('settings-submenu').style.display = 'flex';
      isSettingsSubmenuOpen = true;
      
      // Use the proper function to show master prompt (loads values correctly)
      showMasterPromptSubmenu();
    });
  }

  // QR Scan Button
  const qrScanBtn = document.getElementById('qr-scan-button');
  if (qrScanBtn) {
    qrScanBtn.addEventListener('click', () => {
      const scanBtn = document.getElementById('qr-scan-button');
      const scannerVideo = document.getElementById('qr-scanner-video');
      
      if (scanBtn) {
        scanBtn.disabled = true;
      }
      
      // Start video playback when scan button is pressed
      if (scannerVideo && scannerVideo.paused) {
        scannerVideo.play();
      }
      
      updateQRScannerStatus('Scanning...', '');
      startQRDetection();
    });
  }

  const closeQrModalBtn = document.getElementById('close-qr-modal');
  if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener('click', closeQrModal);
  }

  const startDateBtn = document.getElementById('gallery-start-date-btn');
  const startDateInput = document.getElementById('gallery-start-date');
  if (startDateBtn && startDateInput) {
    startDateBtn.addEventListener('click', () => {
      startDateInput.showPicker();
    });
    startDateInput.addEventListener('change', (e) => {
      galleryStartDate = e.target.value || null;
      updateDateButtonText('start', galleryStartDate);
      onGalleryFilterChange();
    });
  }
  
  const endDateBtn = document.getElementById('gallery-end-date-btn');
  const endDateInput = document.getElementById('gallery-end-date');
  if (endDateBtn && endDateInput) {
    endDateBtn.addEventListener('click', () => {
      endDateInput.showPicker();
    });
    endDateInput.addEventListener('change', (e) => {
      galleryEndDate = e.target.value || null;
      updateDateButtonText('end', galleryEndDate);
      onGalleryFilterChange();
    });
  }
  
  const sortOrderSelect = document.getElementById('gallery-sort-order');
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', (e) => {
      gallerySortOrder = e.target.value;
      // Save sort order preference
      try {
        localStorage.setItem(GALLERY_SORT_ORDER_KEY, gallerySortOrder);
      } catch (err) {
        console.error('Failed to save sort order:', err);
      }
      onGalleryFilterChange();
    });
  }
  
  const prevPageBtn = document.getElementById('prev-page');
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', prevGalleryPage);
  }
  
  const nextPageBtn = document.getElementById('next-page');
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', nextGalleryPage);
  }
  
  const loadPresetBtn = document.getElementById('load-preset-button');
  if (loadPresetBtn) {
    loadPresetBtn.addEventListener('click', showPresetSelector);
  }
  
  const multiPresetBtn = document.getElementById('multi-preset-button');
  if (multiPresetBtn) {
    multiPresetBtn.addEventListener('click', () => {
      if (currentViewerImageIndex >= 0) {
        const imageId = galleryImages[currentViewerImageIndex].id;
        openMultiPresetSelector(imageId);
      }
    });
  }

  // EDITOR button now handles what the viewer prompt used to handle
  const viewerEditorBtn = document.getElementById('viewer-editor-button');
  if (viewerEditorBtn) {
    viewerEditorBtn.addEventListener('click', handleViewerPromptTap);
  }

  // Keep the hidden textarea from triggering anything
  const viewerPromptInput = document.getElementById('viewer-prompt');
  if (viewerPromptInput) {
    viewerPromptInput.addEventListener('input', () => {
      window.viewerLoadedPreset = null;
      // Clear layer mode — user is now typing a custom prompt
      clearGalleryLayerState();
      const promptHeader = document.getElementById('viewer-preset-header');
      if (promptHeader) promptHeader.textContent = 'CUSTOM PROMPT';
    });
  }

  const closePresetSelectorBtn = document.getElementById('close-preset-selector');
  if (closePresetSelectorBtn) {
    closePresetSelectorBtn.addEventListener('click', hidePresetSelector);
  }
  
  if (presetFilter) {
    presetFilter.addEventListener('input', (e) => {
      populatePresetList();
    });
    
    // Hide footer and controls when user starts typing (keyboard appears)
    presetFilter.addEventListener('focus', () => {
      // Hide category footer
      
      // Hide multi-preset controls if they exist
      const multiControls = document.getElementById('multi-preset-controls');
      if (multiControls) {
        multiControls.style.display = 'none';
      }
    });
    
    // Show them back when user is done typing (keyboard dismissed)
    presetFilter.addEventListener('blur', () => {
          // Only restore multi-preset controls if we're in multi-preset mode
      if (isMultiPresetMode) {
        const multiControls = document.getElementById('multi-preset-controls');
        if (multiControls) {
          multiControls.style.display = 'flex';
        }
      }
      
      // Category footer will be restored by updatePresetSelection when needed
    });
  }
  
  const presetSelectorJumpUp = document.getElementById('preset-selector-jump-up');
  if (presetSelectorJumpUp) {
    let psUpTapTimer = null;
    presetSelectorJumpUp.addEventListener('click', () => {
      if (psUpTapTimer) {
        // Double-tap: jump to very top
        clearTimeout(psUpTapTimer);
        psUpTapTimer = null;
        currentPresetIndex_Gallery = 0;
        updatePresetSelection();
      } else {
        psUpTapTimer = setTimeout(() => {
          psUpTapTimer = null;
          // Single-tap: page up
          const container = document.querySelector('.preset-list');
          if (container) {
            container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight);
          }
        }, 300);
      }
    });
  }

  const presetSelectorJumpDown = document.getElementById('preset-selector-jump-down');
  if (presetSelectorJumpDown) {
    let psDownTapTimer = null;
    presetSelectorJumpDown.addEventListener('click', () => {
      if (psDownTapTimer) {
        // Double-tap: jump to very bottom
        clearTimeout(psDownTapTimer);
        psDownTapTimer = null;
        const list = document.getElementById('preset-list');
        if (list) {
          const items = list.querySelectorAll('.preset-item');
          if (items.length > 0) {
            currentPresetIndex_Gallery = items.length - 1;
            updatePresetSelection();
          }
        }
      } else {
        psDownTapTimer = setTimeout(() => {
          psDownTapTimer = null;
          // Single-tap: page down
          const container = document.querySelector('.preset-list');
          if (container) {
            container.scrollTop = Math.min(
              container.scrollHeight - container.clientHeight,
              container.scrollTop + container.clientHeight
            );
          }
        }, 300);
      }
    });
  }

  const magicBtn = document.getElementById('magic-button');
  if (magicBtn) {
    magicBtn.addEventListener('click', submitMagicTransform);
  }
  
  const batchModeToggle = document.getElementById('batch-mode-toggle');
  if (batchModeToggle) {
    batchModeToggle.addEventListener('click', toggleBatchMode);
  }

  const batchNewFolder = document.getElementById('batch-new-folder');
  if (batchNewFolder) {
    batchNewFolder.addEventListener('click', createNewFolder);
  }

  const batchSelectAll = document.getElementById('batch-select-all');
  if (batchSelectAll) {
    batchSelectAll.addEventListener('click', selectAllBatchImages);
  }

  const closeMoveToFolder = document.getElementById('close-move-to-folder');
  if (closeMoveToFolder) {
    closeMoveToFolder.addEventListener('click', () => {
      document.getElementById('move-to-folder-modal').style.display = 'none';
    });
  }

  const batchDeselectAll = document.getElementById('batch-deselect-all');
  if (batchDeselectAll) {
    batchDeselectAll.addEventListener('click', deselectAllBatchImages);
  }

  const batchCancel = document.getElementById('batch-cancel');
  if (batchCancel) {
    batchCancel.addEventListener('click', toggleBatchMode);
  }

  const batchApplyPreset = document.getElementById('batch-apply-preset');
  if (batchApplyPreset) {
    batchApplyPreset.addEventListener('click', applyPresetToBatch);
  }

  const batchCombine = document.getElementById('batch-combine');
  if (batchCombine) {
    batchCombine.addEventListener('click', combineTwoImages);
  }

  const batchDelete = document.getElementById('batch-delete');
  if (batchDelete) {
    batchDelete.addEventListener('click', batchDeleteImages);
  }

  // Load folder structure
  loadFolders();

  // Initialize IndexedDB and load gallery
  initDB().then(async () => {
    // Check if we need to migrate from localStorage
    const oldIndexJson = localStorage.getItem('r1_gallery_index');
    if (oldIndexJson) {
      console.log('Migrating old gallery data...');
      await migrateFromLocalStorage();
    } else {
      await loadGallery();
    }
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
  setupViewerPinchZoom();

});

// Make functions available globally for inline onclick handlers
window.removeFromQueue = removeFromQueue;
window.previewQueueItem = previewQueueItem;
window.clearQueue = clearQueue;
window.tourNext = tourNext;
window.tourBack = tourBack;
window.endGuidedTour = endGuidedTour;
window.startGuidedTour = startGuidedTour;

// Upload image to gofile.io
async function uploadViewerImage() {
  if (currentViewerImageIndex < 0) return;
  
  const uploadBtn = document.getElementById('upload-viewer-image');
  
  try {
    // Disable button and show status
    uploadBtn.disabled = true;
      uploadBtn.innerHTML = '⏳';
    
    // Step 1: Get the best server from gofile.io
    const serverResponse = await fetch('https://api.gofile.io/servers');
    if (!serverResponse.ok) {
      throw new Error('Failed to get upload server');
    }
    const serverData = await serverResponse.json();
    
    if (serverData.status !== 'ok' || !serverData.data || !serverData.data.servers || serverData.data.servers.length === 0) {
      throw new Error('No upload servers available');
    }
    
    // Use the first available server
    const server = serverData.data.servers[0].name;
    
    
    const imageData = galleryImages[currentViewerImageIndex];
    // Convert base64 to blob
    const base64Data = imageData.imageBase64.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // Create form data for gofile.io
    const formData = new FormData();
    formData.append('file', blob, `magic-kamera-${Date.now()}.png`);
    
    // Step 2: Upload to the assigned server (no token needed for guest uploads)
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed - status: ' + response.status);
    }
    
    // gofile.io returns JSON with the download URL
    const result = await response.json();
    
    if (result.status !== 'ok' || !result.data || !result.data.downloadPage) {
      throw new Error('Upload failed: ' + (result.status || 'unknown error'));
    }
    
    const downloadUrl = result.data.downloadPage;
    
    // Show QR code
    showQrCode(downloadUrl.trim());
    
  } catch (error) {
    console.error('Upload error:', error);
  } finally {
    // Re-enable button
    uploadBtn.disabled = false;
      uploadBtn.innerHTML = '📤<br><span class="viewer-carousel-label">Export</span>';
  }
}

// Show QR code modal
function showQrCode(url) {
  const qrModal = document.getElementById('qr-modal');
  const qrContainer = document.getElementById('qr-code-container');
  const qrUrlText = document.getElementById('qr-url-text');
  
  if (!qrModal || !qrContainer || !qrUrlText) return;
  
  // Clear previous QR code
  qrContainer.innerHTML = '';
  
  // Generate new QR code
  new QRCode(qrContainer, {
    text: url,
    width: 128,
    height: 128,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  
  // Set URL text
  qrUrlText.textContent = url;
  
  // Show modal
  qrModal.style.display = 'flex';
}

// Close QR code modal
function closeQrModal() {
  const qrModal = document.getElementById('qr-modal');
  if (qrModal) {
    qrModal.style.display = 'none';
  }
}

// Open QR Scanner Modal
function openQRScannerModal() {
  const scannerModal = document.getElementById('qr-scanner-modal');
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  if (!scannerModal || !scannerVideo) return;
  
  // Show modal
  scannerModal.style.display = 'flex';
  
  // Start camera for QR scanning (but don't start detection yet)
  startQRScannerCamera();
  
  // Reset status
  updateQRScannerStatus('Ready to scan', '');
  
  // Enable scan button
  const scanBtn = document.getElementById('qr-scan-button');
  if (scanBtn) {
    scanBtn.disabled = false;
  }
}

// Close QR Scanner Modal
function closeQRScannerModal() {
  const scannerModal = document.getElementById('qr-scanner-modal');
  if (scannerModal) {
    scannerModal.style.display = 'none';
  }
  
  // Stop QR detection and camera
  stopQRDetection();
  stopQRScannerCamera();
  
  // Reset status
  updateQRScannerStatus('Point camera at QR code...', '');
}

// Start camera for QR scanner
async function startQRScannerCamera() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    
    scannerVideo.srcObject = stream;
    
    // Pause the video until user presses scan button
    scannerVideo.onloadedmetadata = () => {
      scannerVideo.pause();
      updateQRScannerStatus('Ready to scan', '');
    };
  } catch (error) {
    console.error('Error starting QR scanner camera:', error);
    updateQRScannerStatus('Camera access denied', 'error');
  }
}

// Stop QR scanner camera
function stopQRScannerCamera() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  if (scannerVideo && scannerVideo.srcObject) {
    const tracks = scannerVideo.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    scannerVideo.srcObject = null;
  }
}

// Update QR scanner status message
function updateQRScannerStatus(message, type = '') {
  const statusElement = document.getElementById('qr-scanner-status');
  if (statusElement) {
        statusElement.className = 'qr-scanner-status';
    if (type) {
      statusElement.classList.add(type);
    }
  }
}

function playTaDaSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const delays = [0, 0.08, 0.16, 0.28];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'triangle';
        const t = ctx.currentTime + delays[i];
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
      setTimeout(() => { try { ctx.close(); } catch(e){} }, 1500);
    }
  } catch (e) { /* non-critical */ }
}

function showGalleryCreditFlash(message) {
  const header = document.getElementById('viewer-preset-header');
  if (!header) return;
  const original = header.textContent;
  const originalStyle = header.style.cssText;
  header.style.whiteSpace = 'pre-line';
  header.style.lineHeight = '1.3';
  header.style.fontSize = '2.8vw';
  header.textContent = message;
  setTimeout(() => {
    header.textContent = original;
    header.style.cssText = originalStyle;
  }, 3500);
}

// Show gallery status message
function showGalleryStatusMessage(message, type = 'info', duration = 3000) {
  const statusElement = document.getElementById('gallery-status-message');
  if (!statusElement) return;
  
    statusElement.className = 'gallery-status-message';
  
  if (type === 'error') {
    statusElement.classList.add('error');
  } else if (type === 'success') {
    statusElement.classList.add('success');
  }
  
    
  // Auto-hide after duration
  setTimeout(() => {
      }, duration);
}

function startQRDetection() {
  if (qrDetectionActive) return;
  
  qrDetectionActive = true;
  qrDetectionInterval = setInterval(detectQRCode, QR_DETECTION_INTERVAL);
}

// Stop QR code detection
function stopQRDetection() {
  qrDetectionActive = false;
  if (qrDetectionInterval) {
    clearInterval(qrDetectionInterval);
    qrDetectionInterval = null;
  }
  // Don't clear lastDetectedQR here - it's needed for import
  // It will be cleared after successful import in importFromQRCode()
}

// Detect QR code in video stream
function detectQRCode() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  if (!scannerVideo || scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) return;
  
  const tempCanvas = document.createElement('canvas');
  const context = tempCanvas.getContext('2d');
  
  tempCanvas.width = scannerVideo.videoWidth;
  tempCanvas.height = scannerVideo.videoHeight;
  
  context.drawImage(scannerVideo, 0, 0, tempCanvas.width, tempCanvas.height);
  const imageData = context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  
  // Use jsQR library to detect QR code
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  
  if (code && code.data) {
    // Check if it's a valid URL
    if (isValidURL(code.data)) {
      if (lastDetectedQR !== code.data) {
        lastDetectedQR = code.data;
        updateQRScannerStatus('QR Code detected! Importing...', 'success');
        
        // Stop scanning once QR is detected
        stopQRDetection();
        
        // Auto-import when QR code is detected
        setTimeout(() => {
          importFromQRCode();
        }, 500);
      }
    } else {
      stopQRDetection();
      closeQRScannerModal();
      showGalleryStatusMessage('Invalid QR code - must be a valid URL', 'error', 4000);
    }
  } else {
    updateQRScannerStatus('Scanning...', '');
  }
}

// Check if string is valid URL
function isValidURL(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Resize and compress image to match camera resolution settings
async function resizeAndCompressImage(blob, maxWidth = 640, maxHeight = 480, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        
        if (width > height) {
          width = maxWidth;
          height = width / aspectRatio;
        } else {
          height = maxHeight;
          width = height * aspectRatio;
        }
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob
      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve(resizedBlob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // If blob has no type or wrong type, retry by forcing it as image/png
      if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') {
        const retypedBlob = new Blob([blob], { type: 'image/png' });
        const retryUrl = URL.createObjectURL(retypedBlob);
        const retryImg = new Image();
        retryImg.onload = () => {
          URL.revokeObjectURL(retryUrl);
          const canvas = document.createElement('canvas');
          let w = retryImg.width;
          let h = retryImg.height;
          if (w > maxWidth || h > maxHeight) {
            const aspectRatio = w / h;
            if (w > h) { w = maxWidth; h = w / aspectRatio; }
            else { h = maxHeight; w = h * aspectRatio; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(retryImg, 0, 0, w, h);
          canvas.toBlob(
            (resizedBlob) => {
              if (resizedBlob) resolve(resizedBlob);
              else reject(new Error('Failed to compress image'));
            },
            'image/jpeg',
            quality
          );
        };
        retryImg.onerror = () => {
          URL.revokeObjectURL(retryUrl);
          reject(new Error('Failed to load image for resizing'));
        };
        retryImg.src = retryUrl;
      } else {
        reject(new Error('Failed to load image for resizing'));
      }
    };
    
    img.src = url;
  });
}

// Import image from QR code
async function importFromQRCode() {
  if (!lastDetectedQR) {
    closeQRScannerModal();
    showGalleryStatusMessage('No QR code detected', 'error', 3000);
    return;
  }
  
  try {
    updateQRScannerStatus('Downloading image...', '');
    
    const imageUrl = lastDetectedQR.trim();
    
    // Try multiple proxies in order
    const proxies = [
      'https://api.codetabs.com/v1/proxy?quest=',
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      '' // Try direct last
    ];
    
    let response = null;
    let lastError = null;
    
    for (let i = 0; i < proxies.length; i++) {
      try {
        const fetchUrl = proxies[i] ? proxies[i] + encodeURIComponent(imageUrl) : imageUrl;
        
        updateQRScannerStatus(`Trying method ${i + 1}/${proxies.length}...`, '');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        response = await fetch(fetchUrl, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          updateQRScannerStatus('Download successful!', 'success');
          break; // Success!
        }
      } catch (error) {
        lastError = error;
        continue; // Try next proxy
      }
    }
    
    if (!response || !response.ok) {
      throw new Error('All download methods failed');
    }
    
    updateQRScannerStatus('Reading image data...', '');
    
    let blob = await response.blob();
    
    const originalSize = Math.round(blob.size / 1024);
    updateQRScannerStatus('Original size: ' + originalSize + 'KB', '');
    
    // Check if it's an image
    // Allow image/* types AND octet-stream (some proxies return PNG as octet-stream)
    const isImageType = blob.type.startsWith('image/');
    const isOctetStream = blob.type === 'application/octet-stream' || blob.type === '';
    if (blob.type && !isImageType && !isOctetStream) {
      throw new Error('Not an image: ' + blob.type);
    }
    
    // Resize/compress large images to match camera capabilities
    // Use UXGA (1600x1200) as max to balance quality and storage
    updateQRScannerStatus('Optimizing image...', '');
    
    // Use user's selected import resolution
    const importRes = IMPORT_RESOLUTION_OPTIONS[currentImportResolutionIndex];
    blob = await resizeAndCompressImage(blob, importRes.width, importRes.height, 0.85);
    
    const newSize = Math.round(blob.size / 1024);
    updateQRScannerStatus('Compressed: ' + originalSize + 'KB → ' + newSize + 'KB', '');
    
    updateQRScannerStatus('Converting to base64...', '');
    
    // Convert to base64 with timeout protection
    const base64Data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Base64 conversion timeout'));
      }, 10000);
      
      const reader = new FileReader();
      
      reader.onloadend = () => {
        clearTimeout(timeout);
        resolve(reader.result);
      };
      
      reader.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('FileReader error'));
      };
      
      reader.readAsDataURL(blob);
    });
    
    updateQRScannerStatus('Saving to gallery...', '');
    
    // Save to gallery
    const imageData = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      imageBase64: base64Data,
      timestamp: Date.now()
    };
    
    // Add to memory array
    galleryImages.unshift(imageData);
    
    // Save to IndexedDB
    await saveImageToDB(imageData);
    
    updateQRScannerStatus('✅ Import successful!', 'success');
      
    lastDetectedQR = null;
    
    // Close scanner modal after successful import
    closeQRScannerModal();
    
    // Refresh gallery to show new image and show success message
    await showGallery();
    showGalleryStatusMessage('Image imported successfully!', 'success', 3000);
    
  } catch (error) {
    lastDetectedQR = null;
    
    // Close modal and show error in gallery
    closeQRScannerModal();
    showGalleryStatusMessage('Import failed: ' + error.message, 'error', 4000);
  }
}

// Database reset handler - clears ALL modifications and custom presets
document.getElementById('factory-reset-button').addEventListener('click', async () => {
  const message = hasImportedPresets 
    ? 'This will delete ALL custom presets and undo ALL modifications, returning to your clean imported preset list. This cannot be undone. Continue?'
    : 'This will delete ALL custom presets and restore all presets to their original state. This cannot be undone. Continue?';
  
  if (await confirm(message)) {
    // Clear ALL records from preset storage (modifications, deletions, AND custom presets)
    await presetStorage.clearAll();
    
    // Clear any corrupt or stale photo queue from localStorage
    photoQueue = [];
    saveQueue();
    updateQueueDisplay();
    
    // Reload presets from imported list or factory presets
    CAMERA_PRESETS = await mergePresetsWithStorage();
    
    // Reset visible presets to show everything (fresh start)
    if (CAMERA_PRESETS.length > 0) {
        visiblePresets = CAMERA_PRESETS.map(p => p.name);
        saveVisiblePresets();
    }
    
        
    const successMessage = hasImportedPresets
      ? 'All custom presets deleted, modifications cleared, and queue reset. Reset to imported presets!'
      : 'All custom presets deleted, modifications cleared, and queue reset!';
    alert(successMessage);
  }
});

// Carousel infinite scroll logic
document.addEventListener('DOMContentLoaded', function() {
  const carousel = document.querySelector('.mode-carousel-track');
  
  if (carousel) {
    
// Re-attach event listeners to cloned buttons
    const allButtons = carousel.querySelectorAll('.mode-button');
    allButtons.forEach(button => {
      const mode = button.getAttribute('data-mode');
      if (mode === 'random') {
        button.addEventListener('click', toggleRandomMode);
      } else if (mode === 'camera-multi') {
        button.addEventListener('click', openCameraMultiPresetSelector);
      } else if (mode === 'camera-combine') {
        button.addEventListener('click', toggleCameraLiveCombineMode);
      }
    });
  }
});

// Gallery image viewer — tap to toggle both carousels (single or double based on settings)

(function() {
  const viewerEl = document.getElementById('image-viewer');
  if (!viewerEl) return;

  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const DOUBLE_TAP_DELAY = 300;
  const DOUBLE_TAP_RADIUS = 40;

  let leftVisible = true;
  let rightVisible = true;

  // Set carousels visible by default on open
  function initViewerCarousels() {
    const right = document.getElementById('viewer-carousel');
    const left = document.getElementById('viewer-left-carousel');
    if (right) { right.classList.remove('hidden'); rightVisible = true; }
    if (left) { left.classList.remove('hidden'); leftVisible = true; }
  }
  // Expose so openImageViewer can call it
  window.initViewerCarousels = initViewerCarousels;

  function toggleViewerCarousels() {
    const right = document.getElementById('viewer-carousel');
    const left = document.getElementById('viewer-left-carousel');

    leftVisible = !leftVisible;
    rightVisible = !rightVisible;

    if (left) {
      if (leftVisible) left.classList.remove('hidden');
      else left.classList.add('hidden');
    }
    if (right) {
      if (rightVisible) right.classList.remove('hidden');
      else right.classList.add('hidden');
    }

    lastTapTime = 0;
  }

  viewerEl.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;

    const s = window._viewerBtnSettings || { tapMode: 'single' };

    if (s.tapMode === 'single') {
      // Single-tap: skip if the user tapped a button or interactive element so those still work normally
      if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
      toggleViewerCarousels();
      return;
    }

    // Double-tap mode (default)
    const touch = e.changedTouches[0];
    const now = Date.now();
    const timeDiff = now - lastTapTime;
    const distX = Math.abs(touch.clientX - lastTapX);
    const distY = Math.abs(touch.clientY - lastTapY);

    if (timeDiff < DOUBLE_TAP_DELAY && distX < DOUBLE_TAP_RADIUS && distY < DOUBLE_TAP_RADIUS) {
      toggleViewerCarousels();
    } else {
      lastTapTime = now;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
    }
  }, { passive: true });
})();

// --- Gallery Image Viewer Screen: Button Styles ---

(function() {
  const DEFAULT_VIEWER_SETTINGS = { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'single' };
  let viewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  try {
    const saved = localStorage.getItem('r1_viewer_btn_settings');
    if (saved) viewerSettings = { ...DEFAULT_VIEWER_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {}

  window._viewerBtnSettings = viewerSettings;

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function applyViewerBtnStyles() {
    const s = window._viewerBtnSettings;
    const { r, g, b } = hexToRgb(s.bgColor);
    const a = s.opacity / 100;
    const bg = `rgba(${r}, ${g}, ${b}, ${a})`;
    const fc = s.fontColor;

    let styleEl = document.getElementById('_viewer-btn-custom-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '_viewer-btn-custom-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .viewer-carousel-button { background: ${bg} !important; color: ${fc} !important; }
      .viewer-carousel-label { color: ${fc} !important; }
      .viewer-left-carousel-btn { background: ${bg} !important; color: ${fc} !important; }
      .viewer-bottom-btn { background: ${bg} !important; color: ${fc} !important; }
      .viewer-delete-button { background: ${bg} !important; color: ${fc} !important; }
      .viewer-close-button { background: ${bg} !important; color: ${fc} !important; }
    `;
  }

  window._applyViewerBtnStyles = applyViewerBtnStyles;
  applyViewerBtnStyles();
})();

// ===== LEFT CAMERA CAROUSEL =====

(function() {
  // Sync enabled state of MP and Options buttons on load
  function syncLeftCamBtns() {
    const mpBtn = document.getElementById('cam-master-prompt-btn');
    if (mpBtn) {
      if (masterPromptEnabled) mpBtn.classList.add('enabled');
      else mpBtn.classList.remove('enabled');
    }
  }

  // Master Prompt button — opens master prompt submenu directly, returns to camera on exit
  const camMpBtn = document.getElementById('cam-master-prompt-btn');
  if (camMpBtn) {
    camMpBtn.addEventListener('click', () => {
      // Hide carousel so settings has full screen
      document.getElementById('left-cam-carousel').style.display = 'none';
      // Open settings submenu as required parent context
      document.getElementById('unified-menu').style.display = 'none';
      isMenuOpen = false;
      // Go directly to master prompt submenu
      showMasterPromptSubmenu();
      // Flag so hideMasterPromptSubmenu knows to return to camera not settings
      window.masterPromptFromCamera = true;
    });
  }


  // Initial sync after a brief delay to ensure state is loaded
  setTimeout(syncLeftCamBtns, 200);
})();

console.log('AI Camera Styles app initialized!');

// --- Main Camera Screen: Button Styles + Tap-to-Toggle Carousels ---

(function() {
  // ── Load saved settings

  const DEFAULT_SETTINGS = { bgColor: '#000000', opacity: 100, fontColor: '#ffffff', tapMode: 'single' };
  let settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = localStorage.getItem('r1_cam_btn_settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {}

  // Expose on window so the settings submenu (wired up elsewhere) can read/write it
  window._camBtnSettings = settings;

  // ── Apply button styles 

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function applyCamBtnStyles() {
    const s = window._camBtnSettings;
    const { r, g, b } = hexToRgb(s.bgColor);
    const a = s.opacity / 100;
    const bg = `rgba(${r}, ${g}, ${b}, ${a})`;
    const fc = s.fontColor;

    // Use an injected <style> tag so CSS class-based active states (enabled, random-active, etc.) still work
    let styleEl = document.getElementById('_cam-btn-custom-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '_cam-btn-custom-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .left-cam-btn:not(.enabled) { background: ${bg} !important; }
      .left-cam-btn { color: ${fc} !important; }
      .mode-button:not(.random-active):not(.active):not(.camera-multi-active):not(.combine-active):not(.layer-active) { background: ${bg} !important; }
      .mode-button { color: ${fc} !important; }
      .mode-label { color: ${fc} !important; }
      .button-label { color: ${fc} !important; }
    `;
  }

  // Expose so the settings submenu event listeners can call it
  window._applyCamBtnStyles = applyCamBtnStyles;

  // Apply on load
  applyCamBtnStyles();

  // ── Tap-to-toggle carousels

  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const DOUBLE_TAP_DELAY = 300;
  const DOUBLE_TAP_RADIUS = 40;

  let leftVisible = true;
  let rightVisible = true;

  function isOnMainCameraScreen() {
    if (document.getElementById('gallery-modal')?.style.display === 'flex') return false;
    if (document.getElementById('image-viewer')?.style.display === 'flex') return false;
    if (document.getElementById('unified-menu')?.style.display === 'flex') return false;
    if (document.getElementById('settings-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('master-prompt-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('preset-builder-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('button-settings-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('resolution-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('aspect-ratio-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('visible-presets-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('import-resolution-submenu')?.style.display === 'flex') return false;
    if (document.getElementById('tutorial-submenu')?.style.display === 'flex') return false;
    return true;
  }

  function toggleCarousels() {
    const leftCarousel = document.getElementById('left-cam-carousel');
    const rightCarousel = document.querySelector('.mode-carousel');
    const pickerOverlay = document.getElementById('picker-overlay');

    leftVisible = !leftVisible;
    rightVisible = !rightVisible;

    if (leftCarousel) {
      if (leftVisible) leftCarousel.classList.remove('hidden');
      else leftCarousel.classList.add('hidden');
    }
    if (rightCarousel) {
      if (rightVisible) {
        rightCarousel.style.transform = 'translateX(0)';
        rightCarousel.style.pointerEvents = 'auto';
      } else {
        rightCarousel.style.transform = 'translateX(calc(100% + 8px))';
        rightCarousel.style.pointerEvents = 'none';
      }
    }
    if (pickerOverlay) {
      pickerOverlay.style.display = leftVisible ? 'flex' : 'none';
    }
    lastTapTime = 0;
  }

  document.addEventListener('touchend', (e) => {
    if (!isOnMainCameraScreen()) return;
    if (e.changedTouches.length !== 1) return;
    if (e.target.closest('.picker-overlay')) return;

    const s = window._camBtnSettings;

    if (s.tapMode === 'single') {
      // Single-tap: skip if the user tapped a button or interactive element so those still work normally
      if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
      toggleCarousels();
      return;
    }

    // Double-tap mode (default)
    const touch = e.changedTouches[0];
    const now = Date.now();
    const timeDiff = now - lastTapTime;
    const distX = Math.abs(touch.clientX - lastTapX);
    const distY = Math.abs(touch.clientY - lastTapY);

    if (timeDiff < DOUBLE_TAP_DELAY && distX < DOUBLE_TAP_RADIUS && distY < DOUBLE_TAP_RADIUS) {
      toggleCarousels();
    } else {
      lastTapTime = now;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
    }
  }, { passive: true });
})();

// ===== PTT (Push-to-Talk) for Text Fields =====
// When the user taps into any text input or textarea, pressing the
// r1 side button will start/stop speech-to-text and insert the result.

(function() {
  // This tracks whichever text field or textarea the user last tapped into.
  // It starts as null, meaning no field is active.
  let activePttField = null;

  // The list of every text input and textarea in the app that should
  // support PTT. Each one is found by its id from the HTML.
  const pttFieldIds = [
    'master-prompt-text',     // Master prompt textarea in settings
    'preset-builder-prompt',  // AI prompt textarea in preset builder
    'preset-builder-name',    // Preset name field in preset builder
    'preset-builder-category',// Category field in preset builder
    'preset-builder-additional', // Additional rules textarea in preset builder
    'tutorial-search-input',  // Tutorial search field
    'style-name',             // Style name field in edit style
    'style-category',         // Category field in edit style
    'style-message',          // AI prompt textarea in edit style
    'style-additional'        // Additional rules textarea in edit style
  ];

  // When the user taps INTO a field, remember it as the active PTT target.
  // When the user taps AWAY from all fields, clear the active target so
  // that the side button goes back to doing its normal camera functions.
  function attachPttListeners() {
    pttFieldIds.forEach(function(id) {
      const field = document.getElementById(id);
      if (!field) return;

      field.addEventListener('focus', function() {
        activePttField = field;
      });

      field.addEventListener('blur', function() {
        // Small delay so a tap on the PTT button doesn't
        // clear the field before the button event fires.
        setTimeout(function() {
          if (document.activeElement !== field) {
            activePttField = null;
          }
        }, 300);
      });
    });
  }

  // Run immediately for fields that exist on page load,
  // and again after a short delay to catch fields that are
  // built dynamically by the app after startup.
  attachPttListeners();
  setTimeout(attachPttListeners, 2000);

  // The import filter field is created dynamically when the import
  // modal opens, so we watch for it and attach PTT when it appears.
  const importObserver = new MutationObserver(function() {
    const importField = document.getElementById('import-preset-filter');
    if (importField && !importField.dataset.pttAttached) {
      importField.dataset.pttAttached = 'true';
      importField.addEventListener('focus', function() {
        activePttField = importField;
      });
      importField.addEventListener('blur', function() {
        setTimeout(function() {
          if (document.activeElement !== importField) {
            activePttField = null;
          }
        }, 300);
      });
    }
  });
  importObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for the r1 side button being pressed down.
  window.addEventListener('longPressStart', function() {

    // --- TEXT FIELD MODE ---
    // If the user is inside a text field, do speech-to-text into that field.
    if (activePttField) {
      CreationVoiceHandler.postMessage('start');
      return;
    }

    // --- CAMERA VOICE PRESET MODE ---
    // If we are on the main camera screen (no menus open, no text field active),
    // a long press starts listening to create a spoken custom preset.
    // This does NOT work if No Magic Mode is on, Random Mode is on,
    // or Multi-Preset Mode is active — those modes have their own behaviour.
    const galleryOpen = document.getElementById('gallery-modal')?.style.display === 'flex';
    const viewerOpen = document.getElementById('image-viewer')?.style.display === 'flex';
    const menuOpen = document.getElementById('unified-menu')?.style.display === 'flex';
    const settingsOpen = document.getElementById('settings-submenu')?.style.display === 'flex';
    const masterPromptOpen = document.getElementById('master-prompt-submenu')?.style.display === 'flex';
    const presetBuilderOpen = document.getElementById('preset-builder-submenu')?.style.display === 'flex';
    const anyScreenOpen = galleryOpen || viewerOpen || menuOpen || settingsOpen || masterPromptOpen || presetBuilderOpen;

    if (!anyScreenOpen && !noMagicMode && !isRandomMode && !isCameraMultiPresetActive && !isCameraLayerActive) {
      window.isVoicePresetListening = true;
      if (window.isCameraLiveCombineMode) {
              } else {
              }
      CreationVoiceHandler.postMessage('start');
    }
  });

  // Listen for the r1 side button being released.
  window.addEventListener('longPressEnd', function() {

    // --- TEXT FIELD MODE ---
    if (activePttField) {
      CreationVoiceHandler.postMessage('stop');
      return;
    }

    // --- CAMERA VOICE PRESET MODE ---
    // Stop listening and wait for the transcript to come back via onPluginMessage.
    if (window.isVoicePresetListening) {
      CreationVoiceHandler.postMessage('stop');
      // isVoicePresetListening stays true until the transcript arrives
      // so onPluginMessage knows to treat the result as a camera preset
    }
  });

  // When the r1 device finishes listening and sends back the
  // spoken words, insert them into whichever field is active.
  // This also keeps the original AI image response handling working.
  window.onPluginMessage = function(data) {

    // --- Original AI image response handling ---
    if (data && data.status === 'processing') {
          } else if (data && data.status === 'complete') {
          } else if (data && data.error) {
          }

    // --- PTT speech-to-text handling ---
    if (data.type === 'sttEnded' && data.transcript) {

      // TEXT FIELD: insert spoken words into the active field
      if (activePttField) {
        const field = activePttField;
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const before = field.value.substring(0, start);
        const after = field.value.substring(end);
        // Only keep trailing period in the master prompt field — strip it everywhere else

        // Keep trailing period in master prompt, edit style, and preset builder fields
        const keepPeriodFields = new Set([
          'master-prompt-text',
          'style-message',
          'style-additional',
          'preset-builder-prompt',
          'preset-builder-additional'
        ]);
        let insertText = data.transcript;
        if (!keepPeriodFields.has(field.id)) {
          insertText = insertText.replace(/[.,!?;:]+\s*$/, '');
        }
        field.value = before + insertText + after;
        const newPos = start + insertText.length;
        field.setSelectionRange(newPos, newPos);
        field.dispatchEvent(new Event('input', { bubbles: true }));

      // CAMERA VOICE PRESET: transcript becomes the custom preset,
      // then the camera fires immediately
      } else if (window.isVoicePresetListening) {
        window.isVoicePresetListening = false;

        // Build a one-time preset object from the spoken words
        window.voicePreset = {
          name: 'Voice Preset',
          message: data.transcript,
          options: [],
          randomizeOptions: false,
          additionalInstructions: ''
        };

        
        // If camera combine mode is active, the voice preset drives the combine flow.
        // Take photo 1 immediately, save to gallery, then prompt for photo 2.
        if (window.isCameraLiveCombineMode) {
          const dataUrl = captureRawPhotoDataUrl();
          if (dataUrl) {
            addToGallery(dataUrl).catch(err => {
              console.error('Failed to save first combine photo to gallery:', err);
              showStyleReveal('Save failed');
            });
            window.cameraCombineFirstPhoto = dataUrl;
            // Return to live camera view so user can see what they are shooting for photo 2
            capturedImage.style.display = 'none';
            video.style.display = 'block';
            // Store the voice preset so finalizeCameraLiveCombine can use it
            const spokenPreset = window.voicePreset;
            window.voicePreset = null;
                        showStyleReveal('📸 1st done!\nTake 2nd photo');
            // Override the sideClick for next press to capture photo 2 with this voice preset
            window.cameraCombineVoicePreset = spokenPreset;
          }
          return;
        }

        // Normal (non-combine) voice preset — trigger the camera
        capturePhoto();
      }
    }
  };

})();
