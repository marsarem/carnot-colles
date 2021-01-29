"use strict";

// This must be incremented whenever a new version of the viewer's code or
// data is published.
var VIEWER_VERSION = 6;
var DATA_VERSION = 6;

var CACHE_PREFIX = "colles-viewer__";
var VIEWER_CACHE = CACHE_PREFIX + "viewer-v" + VIEWER_VERSION;
var DATA_CACHE = CACHE_PREFIX + "data-v" + DATA_VERSION;

var URL_PREFIX = "/carnot-colles/";

/**
 * Precaches the viewer's code and data.
 * @returns a promise the resolves when done
 */
function precache() {
    return Promise.all([
        caches.open(VIEWER_CACHE).then(function(c) {
            return c.addAll([
                "",
                "apple-touch-icon.png",
                "favicon.ico",
                "icon-16.png",
                "icon-32.png",
                "icon-192.png",
                "icon-512.png",
                "manifest.webmanifest",
            ].map(function(u) {
                return URL_PREFIX + u;
            }));
        }),
        caches.open(DATA_CACHE).then(function(c) {
            return c.add(URL_PREFIX + "data.json");
        }),
    ]);
}

/**
 * Delete caches from older service workers.
 * @returns a promise the resolves when done
 */
function deleteOldCaches() {
    return caches.keys()
        .then(function(keys) {
            return Promise.all(keys
                .filter(function(k) {
                    return k !== VIEWER_CACHE && k !== DATA_CACHE;
                })
                .map(function(k) {
                    return caches.delete(k);
                }));
        });
}

/**
 * Try to respond to the request with the cache first, and then if the cache
 * does not have the resource, then fetch it from the network.
 * @param {RequestInfo} request the request
 * @returns a promise with the response
 */
function tryCacheThenNetwork(request) {
    return caches.match(request)
        .then(function(match) {
            if (match !== undefined)
                return match;
            return fetch(request);
        });
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
