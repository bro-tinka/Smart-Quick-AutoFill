// Smart Form Autofill - Content Script
// IIFE wrapper to prevent global pollution and guard against duplicate injection
// All logic is local and offline - no APIs, no network calls, no LLMs

(function() {
  'use strict';

  // === GUARD: Prevent duplicate injection ===
  if (window.__FORM_AUTOFILL_INJECTED__) {
    return;
  }
  window.__FORM_AUTOFILL_INJECTED__ = true;

  // === STATE MANAGEMENT ===
  let globalObserver = null;
  let observerTimeout = null;
  let observerLifecycleTimeout = null;
  let lastToastMode = null;
  let previewedElements = []; // Track previewed elements for cleanup
  let autofilledElements = new Set(); // Track only fields filled by this content script
  let matchPanelTimeout = null;
  const labelCache = new WeakMap(); // Cache normalized labels per element
  let messageListenerAttached = false;

  // === FIELD MATCHERS DEFINITION ===
  const fieldMatchers = {
    name: [
      "name", "full name", "your name", "candidate name",
      "applicant name", "student name", "enter name",
      "name of student", "name as per records", "full name"
    ],
    email: [
      "email", "email address", "mail id", "e-mail",
      "gmail", "contact email", "your email",
      "official email", "personal email"
    ],
    phone: [
      "phone", "mobile", "mobile number", "phone number",
      "contact number", "contact no", "whatsapp number",
      "phone no", "mobile no", "cell number"
    ],
    age: [
      "age", "your age", "current age",
      "age in years", "enter age"
    ],
    college: [
      "college", "college name", "university",
      "institute", "institution", "school/college",
      "name of college", "name of institution",
      "university name"
    ],
    cgpa: [
      "cgpa", "gpa", "current cgpa",
      "aggregate cgpa", "overall cgpa",
      "grade point", "current gpa"
    ],
    tenth: [
      "10th", "10th percentage", "tenth",
      "ssc", "secondary school", "class 10",
      "high school marks", "10th marks",
      "10th grade"
    ],
    twelfth: [
      "12th", "12th percentage", "twelfth",
      "hsc", "senior secondary", "class 12",
      "intermediate", "12th marks",
      "higher secondary"
    ],
    country: [
      "country", "country name", "nation",
      "your country", "residence country",
      "citizenship"
    ],
    state: [
      "state", "state name", "province",
      "region", "your state", "state of residence"
    ],
    district: [
      "district", "city", "town",
      "your city", "district name",
      "current city", "place"
    ],
    address: [
      "address", "full address", "residential address",
      "permanent address", "current address",
      "home address", "location", "complete address"
    ],
    gender: [
      "gender", "sex", "male / female",
      "your gender", "select gender"
    ],
    dob: [
      "dob", "date of birth", "birth date",
      "date of birth (dob)", "your dob",
      "date born", "birth"
    ],
    branch: [
      "branch", "stream", "department",
      "specialization", "major", "course branch",
      "engineering branch", "academic branch"
    ],
    skills: [
      "skills", "technical skills", "skillset",
      "your skills", "expertise", "competencies",
      "programming skills", "key skills"
    ],
    linkedin: [
      "linkedin", "linkedin profile", "linkedin url",
      "linkedin id", "linked in", "linkedin account",
      "your linkedin", "linkedin profile url",
      "profile on linkedin", "linkedin web address"
    ],
    github: [
      "github", "github profile", "github url",
      "github id", "github account", "git hub",
      "your github", "github username","github profile url"
    ],
    pincode: [
      "pincode", "zip code", "postal code",
      "pin code", "post code", "zipcode",
      "your pincode", "area code"
    ],
    firstName: [
      "first name", "your first name", "enter first name"
    ],
    middleName: [
      "middle name", "your middle name", "enter middle name", "middle initial"
    ],
    lastName: [
      "last name", "your last name", "enter last name", "surname", "your surname", "family name"
    ]
  };

const preprocessedMatchers = {};

Object.entries(fieldMatchers).forEach(([field, keywords]) => {
  preprocessedMatchers[field] = keywords.map(keyword => ({
    raw: keyword,
    tokens: tokenize(keyword)
  }));
});

  // === TEXT NORMALIZATION ===
  function normalize(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // === TOKENIZATION ===
  function tokenize(text) {
    return normalize(text).split(/\s+/).filter(t => t.length > 0);
  }

  // === LEVENSHTEIN DISTANCE (LOCAL, OFFLINE) ===
  function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  // === SIMILARITY (FUZZY MATCHING) ===
  function similarity(a, b) {
    if (a === b) return 1.0;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  // === TOKEN-BASED SCORING (improved matching) ===
  function tokenBasedScore(label, keyword) {
    const labelTokens = tokenize(label);
    const keywordTokens = tokenize(keyword);

    if (labelTokens.length === 0 || keywordTokens.length === 0) return 0;

    let matchCount = 0;
    keywordTokens.forEach(kw => {
      const matched = labelTokens.some(lt => {
        if (lt === kw || similarity(lt, kw) > 0.8) {
          return true;
        }
        return false;
      });
      if (matched) matchCount++;
    });

    return matchCount / keywordTokens.length;
  }

  // === BEST KEYWORD MATCH FOR A FIELD ===
  function getBestKeywordMatch(label, field) {
    let bestKeyword = '';
    let bestScore = 0;

    if (!fieldMatchers[field]) {
      return { keyword: bestKeyword, score: bestScore };
    }

    fieldMatchers[field].forEach(keyword => {
      const score = tokenBasedScore(label, keyword);

      if (score > bestScore) {
        bestScore = score;
        bestKeyword = keyword;
      }
    });

    return {
      keyword: bestKeyword,
      score: Math.round(bestScore * 100)
    };
  }

  // === FIELD MATCHER DETAILS ===
  function findFieldMatch(questionText) {
    const text = normalize(questionText);
    let bestMatch = null;
    let bestKeyword = '';
    let bestScore = 0;
    let bestKeywordTokenCount = 0;

    for (let fieldKey in fieldMatchers) {
      for (let entry of preprocessedMatchers[fieldKey]) {
        const keyword = entry.raw;
        const keyTokens = entry.tokens;
        const score = Math.round(tokenBasedScore(text, keyword) * 100);

        if (
          score > bestScore ||
          (score === bestScore && keyTokens.length > bestKeywordTokenCount)
        ) {
          bestScore = score;
          bestKeyword = keyword;
          bestKeywordTokenCount = keyTokens.length;
          bestMatch = fieldKey;
        }
      }
    }

    // Tuned threshold for fuzzy matching
    if (bestScore > 60) {
      return {
        field: bestMatch,
        keyword: bestKeyword,
        score: bestScore
      };
    }

    return null;
  }

  // === FIELD MATCHER (enhanced) ===
  function findField(questionText) {
    const match = findFieldMatch(questionText);
    return match ? match.field : null;
  }

  // === ELEMENT VISIBILITY CHECK (improved) ===
  function isElementVisible(element) {
    // Skip disabled and hidden types
    if (element.disabled) return false;
    if (element.type === 'hidden') return false;
    
    // Skip readonly inputs when in "empty" mode (can be reconsidered)
    if (element.readOnly) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    // Check bounds - element must have width and height (supports absolute positioning)
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }

  // === IMPROVED LABEL EXTRACTION with CACHING ===
function getLabelText(element) {
  if (labelCache.has(element)) {
    const cached = labelCache.get(element);
    if (cached) return cached;
  }

  const texts = [];

  // associated label
  if (element.labels && element.labels.length > 0) {
    texts.push(element.labels[0].innerText || element.labels[0].textContent);
  }

  // placeholder
  if (element.placeholder) {
    texts.push(element.placeholder);
  }

  // aria-label
  const aria = element.getAttribute("aria-label");
  if (aria) texts.push(aria);

  // aria-labelledby (IMPORTANT for Google Forms)
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    labelledBy.split(" ").forEach(id => {
      const ref = document.getElementById(id);
      if (ref) texts.push(ref.innerText || ref.textContent);
    });
  }

  // previous sibling label
  const prev = element.previousElementSibling;
  if (prev && prev.innerText) {
    texts.push(prev.innerText);
  }

  // closest question container (Google/Microsoft forms)
  const container = element.closest(
    "div[role='listitem'], .freebirdFormviewerViewItemsItemItem, [role='group']"
  );

  if (container) {
    const label = container.querySelector("label, span, div");
    if (label && label.innerText) {
      texts.push(label.innerText);
    }
  }

  // name/id fallback
  if (element.name) texts.push(element.name);
  if (element.id) texts.push(element.id);

  const result = texts.join(" ").trim();

  if (result) labelCache.set(element, result);

  return result;
}
  // === IMPROVED FIELD HIGHLIGHTING (outline + shadow, preserves styles) ===
  const elementStyleMap = new WeakMap(); // Store original inline styles

  function highlightField(element) {
    // Store original styles if not already stored
    if (!elementStyleMap.has(element)) {
      elementStyleMap.set(element, {
        outline: element.style.outline,
        boxShadow: element.style.boxShadow
      });
    }

    // Use outline and shadow (doesn't break layouts like background might)
    element.style.outline = '2px solid #28a745';
    element.style.boxShadow = '0 0 6px rgba(40, 167, 69, 0.4)';
  }

  function unhighlightField(element) {
    if (elementStyleMap.has(element)) {
      const original = elementStyleMap.get(element);
      element.style.outline = original.outline || '';
      element.style.boxShadow = original.boxShadow || '';
    }
  }

  // === TOAST NOTIFICATION (improved) ===
  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: #fff;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 99999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(400px)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeCssIdentifier(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function dispatchFieldEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function trackAutofilledElement(element) {
    if (element) {
      autofilledElements.add(element);
    }
  }

  function addMatchDetail(matchDetails, labelText, field, keyword, score) {
    matchDetails.push({
      field,
      label: labelText,
      score,
      matchedKeyword: keyword
    });
  }

  function buildFieldScoreMap(matchDetails) {
  const scoreMap = {};

  matchDetails.forEach(detail => {
    const existing = scoreMap[detail.field];

    // Keep highest confidence score per field
    if (!existing || detail.score > existing.score) {
      scoreMap[detail.field] = {
        score: detail.score,
        keyword: detail.matchedKeyword,
        label: detail.label
      };
    }
  });

  return scoreMap;
}

function persistFieldScores(scoreMap) {
  chrome.storage.local.set({
    latestFieldScores: scoreMap
  });
}

  function showMatchPanel(matchDetails) {
    const existingPanel = document.getElementById('smart-autofill-panel');
    if (existingPanel) existingPanel.remove();
    clearTimeout(matchPanelTimeout);

    if (!matchDetails || matchDetails.length === 0) return;

    const panel = document.createElement('div');
    panel.id = 'smart-autofill-panel';
    panel.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 72px;
      width: min(520px, calc(100vw - 32px));
      max-height: 360px;
      overflow: hidden;
      z-index: 999999;
      background: #181c20;
      color: #f3f6f8;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 8px;
      box-shadow: 0 12px 34px rgba(0,0,0,0.36);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: auto;
    `;

    const rows = matchDetails.map(detail => `
      <tr>
        <td>${escapeHtml(detail.label || '(no label)')}</td>
        <td>${escapeHtml(detail.field)}</td>
        <td>${escapeHtml(detail.matchedKeyword)}</td>
        <td>${escapeHtml(detail.score)}%</td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div id="smart-autofill-panel-header" style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:10px 12px;
        background:#222830;
        cursor:move;
        user-select:none;
      ">
        <strong>Smart Autofill Matches (${matchDetails.length})</strong>
        <button id="smart-autofill-panel-toggle" type="button" style="
          background:#313945;
          color:#fff;
          border:0;
          border-radius:4px;
          cursor:pointer;
          width:26px;
          height:24px;
          line-height:20px;
        ">-</button>
      </div>
      <div id="smart-autofill-panel-body" style="max-height:300px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th>Form Label</th>
              <th>Matched Field</th>
              <th>Keyword</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #smart-autofill-panel th,
      #smart-autofill-panel td {
        padding: 7px 9px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        text-align: left;
        vertical-align: top;
      }
      #smart-autofill-panel th {
        position: sticky;
        top: 0;
        background: #181c20;
        color: #aeb9c4;
        font-weight: 700;
      }
    `;
    panel.appendChild(style);
    document.body.appendChild(panel);

    const body = panel.querySelector('#smart-autofill-panel-body');
    const toggle = panel.querySelector('#smart-autofill-panel-toggle');
    toggle.addEventListener('click', () => {
      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? 'block' : 'none';
      toggle.textContent = isCollapsed ? '-' : '+';
    });

    const header = panel.querySelector('#smart-autofill-panel-header');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseMove = (event) => {
      if (!isDragging) return;
      panel.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
      panel.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', (event) => {
      if (event.target === toggle) return;
      const rect = panel.getBoundingClientRect();
      isDragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    matchPanelTimeout = setTimeout(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (panel.isConnected) panel.remove();
    }, 8000);
  }

  function clearAutofilledFields() {
    let cleared = 0;

    autofilledElements.forEach(element => {
      if (!element || !element.isConnected) return;

      if (
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA'
      ) {
        if (
          element.type === 'checkbox' ||
          element.type === 'radio'
        ) {
          element.checked = false;
        } else {
          element.value = '';
        }
      } else if (element.tagName === 'SELECT') {
        element.selectedIndex = 0;
      } else if (element.contentEditable === 'true') {
        element.innerText = '';
      }

      unhighlightField(element);
      dispatchFieldEvents(element);
      cleared++;
    });

    autofilledElements.clear();
    showToast(`Cleared ${cleared} autofilled fields`);
  }

  // === PREVIEW MODE (with staged retries for dynamic forms) ===
  let previewTimeout1 = null;
  let previewTimeout2 = null;

  function previewFill(userData, isRetry = false) {
    // Clear previous preview outlines only on initial call
    if (!isRetry) {
      previewedElements.forEach(el => {
        if (el && el.parentNode) {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
      });
      previewedElements = [];
    }

    let count = 0;
    const selectors = [
      "input[type='text']",
      "input[type='email']",
      "input[type='tel']",
      "input[type='number']",
      "input[type='date']",
      "textarea",
      "select",
      "input[type='checkbox']",
      "input[type='radio']",
      "[contenteditable='true']"
    ];

    document.querySelectorAll(selectors.join(',')).forEach(element => {
      if (!isElementVisible(element)) return;
      
      const labelText = getLabelText(element);
      
      // Retry label extraction if empty (DOM might not be ready)
      if (!labelText && isRetry) {
        // Force re-extract by clearing cache for this element
        if (labelCache.has(element)) {
          // The cache is a WeakMap, we can't delete, but we can re-get
        }
      }
      
      const field = findField(labelText);
      if (field && userData[field]) {
        // Avoid adding duplicates
        if (!previewedElements.includes(element)) {
          element.style.outline = '2px solid #ff9800';
          element.style.outlineOffset = '2px';
          previewedElements.push(element);
        }
      }
    });

    // Count preview-highlighted elements
    count = previewedElements.filter(el => el && el.style.outline === '2px solid #ff9800').length;

    // Scan shadow DOM
    const shadowElements = [];
    const walkShadowDOM = (node) => {
      if (node.shadowRoot) {
        const elements = node.shadowRoot.querySelectorAll(
          "input, textarea, select, [contenteditable='true']"
        );
        
        elements.forEach(el => {
          if (!isElementVisible(el)) return;
          const labelText = getLabelText(el);
          const field = findField(labelText);
          
          if (field && userData[field]) {
            if (!shadowElements.includes(el)) {
              el.style.outline = '2px solid #ff9800';
              el.style.outlineOffset = '2px';
              shadowElements.push(el);
              count++;
            }
          }
        });
      }

      for (let child of node.children) {
        walkShadowDOM(child);
      }
    };
    walkShadowDOM(document.documentElement);

    // Schedule delayed retries to catch dynamically rendered forms
    if (!isRetry) {
      // First retry at 500ms
      previewTimeout1 = setTimeout(() => {
        previewFill(userData, true);
      }, 500);
      
      // Second retry at 1200ms (final)
      previewTimeout2 = setTimeout(() => {
        previewFill(userData, true);
      }, 1200);
      
      // Show preliminary message on first call
      showToast(`ðŸ‘� Preview: Scanning forms...`);
    } else if (count > 0) {
      // Show final count only if this retry found fields
      showToast(`ðŸ‘� Preview: ${count} fields would be filled`);
    }
  }

  // === SHADOW DOM SUPPORT ===
  function scanShadowDOM(userData, parentFillFn, isPreview = false) {
    const walkShadowDOM = (node) => {
      // Check if node has shadowRoot
      if (node.shadowRoot) {
        const elements = node.shadowRoot.querySelectorAll(
          "input, textarea, select, [contenteditable='true']"
        );
        
        elements.forEach(el => {
          if (!isElementVisible(el)) return;
          const labelText = getLabelText(el);
          const field = findField(labelText);
          
          if (field && userData[field]) {
            if (isPreview) {
              el.style.outline = '2px solid #ff9800';
              el.style.outlineOffset = '2px';
              previewedElements.push(el);
            } else if (parentFillFn) {
              parentFillFn(el, field, userData[field]);
            }
          }
        });
      }

      // Recursively check all children
      for (let child of node.children) {
        walkShadowDOM(child);
      }
    };

    walkShadowDOM(document.documentElement);
  }

  // === IMPROVED FORM FILLING ===
  function fillForm(userData, mode = 'empty') {
    let filledCount = 0;
    const matchDetails = [];

    // ===== TEXT INPUTS, TEXTAREAS, DATES, ETC =====
    const textElements = document.querySelectorAll(
      "input[type='text'], input[type='email'], input[type='tel'], input[type='number'], input[type='date'], textarea"
    );

    textElements.forEach(element => {
      if (!isElementVisible(element)) return;
      if (mode === 'empty' && element.value.trim().length > 0) return;

      const labelText = getLabelText(element);
      const match = findFieldMatch(labelText);
      if (!match) return;

      const field = match.field;

      // Handle separate name fields
      if (field === 'firstName' && userData.firstName) {
        element.value = userData.firstName;
      } else if (field === 'middleName' && userData.middleName) {
        element.value = userData.middleName;
      } else if (field === 'lastName' && userData.lastName) {
        element.value = userData.lastName;
      } else if (field === 'name' && userData.name) {
        element.value = userData.name;
      } else if (userData[field]) {
        element.value = userData[field];
      } else {
        return;
      }

      element.focus();
      highlightField(element);
      dispatchFieldEvents(element);
      trackAutofilledElement(element);
      addMatchDetail(matchDetails, labelText, field, match.keyword, match.score);

      filledCount++;
    });

    // ===== CONTENTEDITABLE FIELDS =====
    const editableElements = document.querySelectorAll("[contenteditable='true']");
    
    editableElements.forEach(element => {
      if (!isElementVisible(element)) return;
      if (mode === 'empty' && (element.innerText || '').trim().length > 0) return;

      const labelText = getLabelText(element);
      const match = findFieldMatch(labelText);
      const field = match ? match.field : null;
      if (!field || !userData[field]) return;

      element.focus();
      element.innerText = userData[field];
      highlightField(element);

      dispatchFieldEvents(element);
      trackAutofilledElement(element);
      addMatchDetail(matchDetails, labelText, field, match.keyword, match.score);

      filledCount++;
    });

    // ===== SELECT DROPDOWNS (improved) =====
    const selects = document.querySelectorAll('select');

    selects.forEach(select => {
      if (!isElementVisible(select)) return;
      if (mode === 'empty' && select.value.length > 0) return;

      const labelText = getLabelText(select);
      const match = findFieldMatch(labelText);
      const field = match ? match.field : null;
      if (!field || !userData[field]) return;

      const targetValue = userData[field].toLowerCase();
      let bestOption = null;
      let bestScore = 0;

      // Score all valid options (skip disabled and placeholder options)
      for (let option of select.options) {
        if (option.disabled) continue;
        
        // Skip placeholder-like options (empty value or common placeholder text)
        if (!option.value || option.text === option.value && option.text === '') continue;
        
        const optionScore = Math.max(
          tokenBasedScore(option.text, targetValue),
          tokenBasedScore(option.value, targetValue)
        );
        
        if (optionScore > bestScore) {
          bestScore = optionScore;
          bestOption = option;
        }
      }

      if (bestOption && bestScore > 0.55) {
        select.value = bestOption.value;
        highlightField(select);
        dispatchFieldEvents(select);
        trackAutofilledElement(select);
        addMatchDetail(matchDetails, labelText, field, match.keyword, match.score);
        
        filledCount++;
      }
    });

    // ===== CHECKBOXES AND RADIOS (improved) =====
    const radioGroups = {}; // Track which radio groups have been filled
    const checkboxesAndRadios = document.querySelectorAll(
      "input[type='checkbox'], input[type='radio']"
    );

    checkboxesAndRadios.forEach(element => {
      if (!isElementVisible(element)) return;
      if (mode === 'empty' && element.checked) return;

      const labelText = getLabelText(element);
      const match = findFieldMatch(labelText);
      const field = match ? match.field : null;
      if (!field || !userData[field]) return;

      const targetValue = userData[field].toLowerCase();
      const elementLabel = element.labels && element.labels[0]
        ? element.labels[0].innerText.toLowerCase()
        : element.value.toLowerCase();

      const labelScore = tokenBasedScore(elementLabel, targetValue);
      const valueScore = tokenBasedScore(element.value.toLowerCase(), targetValue);
      const maxScore = Math.max(labelScore, valueScore);

      if (maxScore > 0.65) {
        // RADIO BUTTONS: Only one per named group
        if (element.type === 'radio') {
          const groupName = element.name || `__unnamed_${field}`;
          
          // Skip if this group already has a filled radio
          if (radioGroups[groupName]) return;
          
          // Uncheck other radios in the same group (for mode='force')
          if (mode === 'force' && element.name) {
            const root = element.getRootNode();
            root.querySelectorAll(`input[type='radio'][name='${escapeCssIdentifier(element.name)}']`).forEach(radio => {
              radio.checked = false;
            });
          }
          
          element.checked = true;
          radioGroups[groupName] = true; // Mark group as filled
        } 
        // CHECKBOXES: Allow multiple selections
        else {
          element.checked = true;
        }

        highlightField(element);
        dispatchFieldEvents(element);
        trackAutofilledElement(element);
        addMatchDetail(matchDetails, labelText, field, match.keyword, match.score);
        
        filledCount++;
      }
    });

    // ===== SHADOW DOM FIELDS =====
    scanShadowDOM(userData, (element, field, value) => {
      const labelText = getLabelText(element);
      const match = findFieldMatch(labelText) || {
        field,
        keyword: getBestKeywordMatch(labelText, field).keyword,
        score: getBestKeywordMatch(labelText, field).score
      };

      if (element.tagName === 'SELECT') {
        if (mode === 'empty' && element.value.length > 0) return;

        const targetValue = value.toLowerCase();
        let bestOption = null;
        let bestScore = 0;

        for (let option of element.options) {
          if (option.disabled) continue;
          if (!option.value || option.text === option.value && option.text === '') continue;

          const optionScore = Math.max(
            tokenBasedScore(option.text, targetValue),
            tokenBasedScore(option.value, targetValue)
          );

          if (optionScore > bestScore) {
            bestScore = optionScore;
            bestOption = option;
          }
        }

        if (!bestOption || bestScore <= 0.55) return;
        element.value = bestOption.value;
      } else if (element.type === 'checkbox' || element.type === 'radio') {
        if (mode === 'empty' && element.checked) return;

        const targetValue = value.toLowerCase();
        const elementLabel = element.labels && element.labels[0]
          ? element.labels[0].innerText.toLowerCase()
          : element.value.toLowerCase();

        const maxScore = Math.max(
          tokenBasedScore(elementLabel, targetValue),
          tokenBasedScore(element.value.toLowerCase(), targetValue)
        );

        if (maxScore <= 0.65) return;

        if (element.type === 'radio') {
          const groupName = element.name || `__shadow_unnamed_${field}`;
          if (radioGroups[groupName]) return;
          element.checked = true;
          radioGroups[groupName] = true;
        } else {
          element.checked = true;
        }
      } else if (element.contentEditable === 'true') {
        if (mode === 'empty' && (element.innerText || '').trim().length > 0) return;
        element.focus();
        element.innerText = value;
      } else {
        if (mode === 'empty' && element.value.trim().length > 0) return;
        element.value = value;
      }

      highlightField(element);
      trackAutofilledElement(element);
      dispatchFieldEvents(element);
      addMatchDetail(matchDetails, labelText, match.field, match.keyword, match.score);
      filledCount++;
    }, false);

    const scoreMap = buildFieldScoreMap(matchDetails);

    showToast(`Filled ${filledCount} fields`);
    showMatchPanel(matchDetails);

    // Send scores back to popup
    persistFieldScores(scoreMap);

    chrome.runtime.sendMessage({
    action: 'fieldScores',
    scores: scoreMap
    });

    return filledCount;
  }

  // === MUTATION OBSERVER FOR DYNAMIC FORMS (controlled lifecycle) ===
  function setupMutationObserver(userData, mode) {
    // Clean up previous observer if it exists
    if (globalObserver) {
      globalObserver.disconnect();
      globalObserver = null;
    }
    clearTimeout(observerTimeout);
    clearTimeout(observerLifecycleTimeout);

    const OBSERVER_TIMEOUT = 5000; // 5 seconds
    const DEBOUNCE_DELAY = 800; // 800ms debounce for mutations

    globalObserver = new MutationObserver((mutations) => {
      // Only trigger if relevant nodes were added (inputs, selects, textareas, contenteditable)
      const hasRelevantNodes = mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        for (let node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          // Check if node itself is a form element
          if (['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) return true;
          if (node.contentEditable === 'true') return true;
          
          // Check if node contains form elements
          if (node.querySelector && node.querySelector('input, select, textarea, [contenteditable="true"]')) {
            return true;
          }
        }
        return false;
      });

      if (!hasRelevantNodes) return;

      // Debounce: wait before refilling if DOM keeps changing
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        fillForm(userData, mode);
      }, DEBOUNCE_DELAY);
    });

    globalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });

    // Auto-disconnect observer after timeout
    observerLifecycleTimeout = setTimeout(() => {
      if (globalObserver) {
        globalObserver.disconnect();
        globalObserver = null;
      }
    }, OBSERVER_TIMEOUT);

    // Perform initial fills with staged approach
    // Stage 1: Immediate fill
    fillForm(userData, mode);

    // Stage 2: Delayed fill (catches forms that render shortly after injection)
    setTimeout(() => {
      if (globalObserver) { // Only refill if observer is still active
        fillForm(userData, mode);
      }
    }, 600);
  }

  // === MESSAGE LISTENER (guard against duplicates) ===
  if (!messageListenerAttached) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'fillForm') {
        chrome.storage.local.get('userData', (res) => {
          if (!res.userData || Object.keys(res.userData).length === 0) {
            showToast('âš  No saved data');
            return;
          }

          const mode = msg.mode || 'empty'; // 'empty', 'force', or 'preview'

          if (mode === 'preview') {
            // Clear any pending preview retries before starting new preview
            clearTimeout(previewTimeout1);
            clearTimeout(previewTimeout2);
            previewFill(res.userData, false);
          } else {
            lastToastMode = mode; // Track mode for single toast
            fillForm(res.userData, mode);
            setupMutationObserver(res.userData, mode);
          }
        });
      } else if (msg.action === 'clearFilledFields') {
        clearAutofilledFields();
      }
    });
    messageListenerAttached = true;
  }

})();
