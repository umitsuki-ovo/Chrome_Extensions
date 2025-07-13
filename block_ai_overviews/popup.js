const toggle = document.getElementById('toggle');

// Load and apply initial state from storage
chrome.storage.sync.get('enabled', (data) => {
    const isEnabled = data.enabled ?? true;  // Default to ON
    toggle.checked = isEnabled;

    chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: isEnabled ? ["default_rules"] : [],
        disableRulesetIds: isEnabled ? [] : ["default_rules"]
    });
});

// Handle toggle switch changes
toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;

    // Save the new state
    chrome.storage.sync.set({ enabled: isEnabled });

    // Enable or disable the ruleset accordingly
    chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: isEnabled ? ["default_rules"] : [],
        disableRulesetIds: isEnabled ? [] : ["default_rules"]
    });
});
