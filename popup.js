'use strict';

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
      showPopupToast("✓ Data saved!");
    });
  });
};

// === LOAD EXISTING DATA ===
window.onload = () => {
  chrome.storage.local.get("userData", (res) => {
    if (!res.userData) return;
    Object.keys(res.userData).forEach(key => {
      const element = document.getElementById(key);
      if (element) {
        element.value = res.userData[key];
      }
    });
  });
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

// === CLEAR FIELD ===
document.getElementById("clearSingle").onclick = () => {
  const fieldName = document.getElementById("fieldToClear").value;
  if (!fieldName) {
    showPopupToast("Select a field to clear");
    return;
  }

  chrome.storage.local.get("userData", (res) => {
    const userData = res.userData || {};
    delete userData[fieldName];
    chrome.storage.local.set({ userData }, () => {
      const element = document.getElementById(fieldName);
      if (element) {
        element.value = '';
      }
      showPopupToast(`✓ Cleared: ${fieldName}`);
    });
  });
};

// === CLEAR ALL DATA ===
document.getElementById("clearAll").onclick = () => {
  if (confirm('Are you sure? This will clear all saved data.')) {
    chrome.storage.local.set({ userData: {} }, () => {
      // Clear all input fields
      document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], textarea').forEach(el => {
        el.value = '';
      });
      showPopupToast("✓ All data cleared!");
    });
  }
};