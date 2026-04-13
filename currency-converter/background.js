let cache = {
    rates: null,
    timestamp: 0
};

const CACHE_TIME = 1000 * 60 * 60; // 1h

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_RATES") {
        const now = Date.now();

        if (cache.rates && (now - cache.timestamp < CACHE_TIME)) {
            sendResponse(cache.rates);
            return true;
        }

        fetch("https://api.exchangerate-api.com/v4/latest/USD")
        .then(res => res.json())
        .then(data => {
            cache = {
                rates: data.rates,
                timestamp: now
            };
            sendResponse(data.rates);
        });

        return true;
    }
});