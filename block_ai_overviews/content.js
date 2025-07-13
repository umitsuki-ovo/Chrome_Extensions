chrome.storage.sync.get("enabled", ({ enabled }) => {
    if (!enabled) return;

    // Get search query
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q").replaceAll('+', ' ');
    if (!query) return;

    // Hide data-q elements that contain query
    const selector = `[data-q="${query}"]`;
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
        el.style.display = "none";
    });

    // Also use MutationObserver for dynamic loading
    const observer = new MutationObserver(() => {
        const dynamicElements = document.querySelectorAll(selector);
        dynamicElements.forEach(el => {
            el.style.display = "none";
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
});