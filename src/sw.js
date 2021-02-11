"use strict";

// This must be incremented whenever a new version of the viewer's code or
// data is published.
const VERSION = 6;
const CACHE_NAME = "colles-viewer-" + VERSION;

const URL_PREFIX = "/carnot-colles/";

/**
 * Precaches the viewer's code and data.
 * @returns {Promise} a promise that resolves when it's done
 */
async function precache() {
    const cache = await caches.open(CACHE_NAME);
    const URLS = [
        "",
        "apple-touch-icon.png",
        "data.json",
        "favicon.ico",
        "icon-16.png",
        "icon-32.png",
        "icon-192.png",
        "icon-512.png",
        "manifest.webmanifest",
    ].map(u => URL_PREFIX + u);
    await cache.addAll(URLS);
}

/**
 * Delete caches from older service workers.
 * @returns {Promise} a promise that resolves when it's done
 */
async function deleteOldCaches() {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k)));
}

/**
 * Try to respond to the request with the cache first, and then if the cache
 * does not have the resource, then fetch it from the network.
 * @param {RequestInfo} request the request
 * @returns a promise with the response
 */
async function tryCacheThenNetwork(request) {
    const match = await caches.match(request);
    if (match !== undefined)
        return match;
    return await fetch(request);
}

/**
 * Replaces the cache for the viewer HTML with the given HTML.
 * @param {string} html the document's innerHTML
 * @returns {Promise} a promise that resolves when it's done
 */
async function savePreRenderedViewer(html) {
    const cache = await caches.open(CACHE_NAME);
    const page = "<!doctype html>" + html;
    await cache.put(URL_PREFIX, new Response(page, {
        headers: { "content-type": "text/html" },
    }));
}

self.addEventListener("install", function(e) {
    e.waitUntil(precache()
        .then(function() {
            // Force the update right now (do not wait until all tabs are closed). This
            // is fine as the tabs tabs themselves will reload the page so there is no
            // risk of mixing old and new assets.
            self.skipWaiting();
        }));
});

self.addEventListener("activate", function(e) {
    e.waitUntil(deleteOldCaches());
});

self.addEventListener("fetch", function(e) {
    e.respondWith(tryCacheThenNetwork(e.request));
});

self.addEventListener("message", function(e) {
    savePreRenderedViewer(e.data);
});
