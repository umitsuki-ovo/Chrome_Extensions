const toggle = document.getElementById("toggle");
const currency = document.getElementById("currency");

chrome.storage.sync.get(["enabled", "target"], (data) => {
    toggle.checked = data.enabled ?? true;
    currency.value = data.target ?? "JPY";
});

toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggle.checked });
});

currency.addEventListener("change", () => {
    chrome.storage.sync.set({ target: currency.value });
});