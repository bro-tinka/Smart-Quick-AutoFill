'use strict';

const SCORE_STORAGE_KEY = 'latestFieldScores';

const SCORE_COLORS = {
  HIGH: '#4CAF50',
  MEDIUM: '#FFC107',
  LOW: '#F44336'
};

// === EXTRACT FIRST, MIDDLE, LAST NAME FROM FULL NAME ===
function extractNameParts(fullName) {
  if (!fullName || fullName.trim().length === 0) {
    return {};
  }

  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 0);
  const result = {};

  if (parts.length === 1) {
    result.firstName = parts[0];
  } else if (parts.length === 2) {
    result.firstName = parts[0];
    result.lastName = parts[1];
  } else if (parts.length >= 3) {
    result.firstName = parts[0];
    result.middleName = parts.slice(1, -1).join(' ');
    result.lastName = parts[parts.length - 1];
  }

  return result;
}

// === SCORE HELPERS ===
function normalizePercent(score) {
  return score <= 1
    ? Math.round(score * 100)
    : Math.round(score);
}

function getScoreColor(percent) {
  if (percent >= 90) return SCORE_COLORS.HIGH;
  if (percent >= 70) return SCORE_COLORS.MEDIUM;
  return SCORE_COLORS.LOW;
}

function clearFieldScores() {
  document.querySelectorAll('.match-score').forEach(el => {
    el.textContent = '';
    el.style.opacity = 'hidden';
  });
}

function renderFieldScores(scores = {}) {
  clearFieldScores();

  Object.entries(scores).forEach(([field, data]) => {
    const scoreElement = document.getElementById(`score-${field}`);

    if (!scoreElement) return;

    const percent = normalizePercent(data.score);

    scoreElement.textContent = `${percent}%`;
    scoreElement.style.visibility = 'visible';
    scoreElement.style.color = getScoreColor(percent);
  });
}

function loadSavedScores() {
  chrome.storage.local.get(SCORE_STORAGE_KEY, (res) => {
    const scores = res[SCORE_STORAGE_KEY];

    if (!scores) return;

    renderFieldScores(scores);
  });
}

function populateUserDataFields(userData = {}) {
  Object.keys(userData).forEach(key => {
    const element = document.getElementById(key);

    if (element) {
      element.value = userData[key];
    }
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// === SAVE DATA ===
document.getElementById("save").onclick = () => {
  const data = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    age: document.getElementById("age").value,
    college: document.getElementById("college").value,
    cgpa: document.getElementById("cgpa").value,
    tenth: document.getElementById("tenth").value,
    twelfth: document.getElementById("twelfth").value,
    country: document.getElementById("country").value,
    state: document.getElementById("state").value,
    district: document.getElementById("district").value,
    address: document.getElementById("address").value,
    gender: document.getElementById("gender").value,
    dob: document.getElementById("dob").value,
    branch: document.getElementById("branch").value,
    skills: document.getElementById("skills").value,
    linkedin: document.getElementById("linkedin").value,
    github: document.getElementById("github").value,
    pincode: document.getElementById("pincode").value
  };

  // Extract first, middle, last name from full name if provided
  if (data.name && data.name.trim().length > 0) {
    const nameParts = extractNameParts(data.name);
    Object.assign(data, nameParts);
  }

  // Merge logic: preserve existing data for empty fields
  chrome.storage.local.get("userData", (res) => {
    const existingData = res.userData || {};
    const mergedData = { ...existingData };

    // Only overwrite if new value is not empty
    Object.keys(data).forEach(key => {
      if (data[key] !== "") {
        mergedData[key] = data[key];
      }
    });

    chrome.storage.local.set({ userData: mergedData }, () => {
      showPopupToast("Data saved!");
    });
  });
};

// === LOAD EXISTING DATA ===
window.onload = () => {
  chrome.storage.local.get("userData", (res) => {
    if (!res.userData) return;
    populateUserDataFields(res.userData);
  });

  loadSavedScores();
};

// === EXPORT THE DATA LOCALLY ====

document.getElementById("exportData").onclick = () => {
  chrome.storage.local.get("userData", (res) => {
    const userData = res.userData || {};

    const blob = new Blob(
      [JSON.stringify(userData, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url,
      filename: "quick-formfill-user-data.json",
      saveAs: true
    }, () => {
      URL.revokeObjectURL(url);
    });
  });
};

// === IMPORT SAVED DATA LOCALLY ===
document.getElementById("importData").onclick = () => {
  document.getElementById("importFile").click();
};

document.getElementById("importFile").onchange = (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const userData = isPlainObject(parsed.userData) ? parsed.userData : parsed;

      if (!isPlainObject(userData)) {
        showPopupToast("Import failed: invalid JSON format");
        return;
      }

      chrome.storage.local.set({ userData }, () => {
        populateUserDataFields(userData);
        showPopupToast("Imported saved data!");
      });
    } catch (error) {
      showPopupToast("Import failed: invalid JSON file");
    } finally {
      event.target.value = '';
    }
  };

  reader.onerror = () => {
    showPopupToast("Import failed: could not read file");
    event.target.value = '';
  };

  reader.readAsText(file);
};

// === POPUP TOAST NOTIFICATION ===
function showPopupToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #333;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// === FILL FORM (EMPTY ONLY - default) ===
document.getElementById("fillEmpty").onclick = () => {
  injectAndFill('empty');
};

// === FILL FORM (FORCE ALL) ===
document.getElementById("fillForce").onclick = () => {
  injectAndFill('force');
};

// === PREVIEW FILL (outline only) ===
document.getElementById("preview").onclick = () => {
  injectAndFill('preview');
};

// === CLEAR AUTOFILLED FIELDS ON PAGE ===
document.getElementById("clearFilled").onclick = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }, () => {
      chrome.tabs.sendMessage(tabId, {
        action: "clearFilledFields"
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Clear message sent to content script');
        }
      });
    });
  });
};

// === INJECTION HELPER ===
function injectAndFill(mode) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    // Inject content.js dynamically
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }, () => {
      // After injection, send message with mode
      chrome.tabs.sendMessage(tabId, {
        action: "fillForm",
        mode: mode
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Message sent to content script');
        }
      });
    });
  });
}

// === RECEIVE FIELD MATCH SCORES ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== 'fieldScores') return;

  renderFieldScores(msg.scores);
});
