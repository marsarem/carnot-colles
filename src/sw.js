"use strict";

var URL_PREFIX = "/carnot-colles";

var VIEWER_CACHE = "colles-viewer-v1";
var DATA_CACHE = "colles-data-v1";

function precache() {
    return Promise.all([
        caches.open(VIEWER_CACHE).then(function(c) {
            return c.addAll([
                URL_PREFIX + "/",
                URL_PREFIX + "/favicon.ico",
                URL_PREFIX + "/icon.svg",
                URL_PREFIX + "/manifest.webmanifest",
                URL_PREFIX + "/apple-touch-icon.png",
            ]);
        }),
        caches.open(DATA_CACHE).then(function(c) {
            return c.addAll([
                URL_PREFIX + "/data/mp-star.json",
                URL_PREFIX + "/data/mpsi1.json",
                URL_PREFIX + "/data/mpsi2.json",
                URL_PREFIX + "/data/mpsi3.json",
                URL_PREFIX + "/data/psi-star.json",
            ]);
        }),
    ]);
}

function fromCache(request) {
    return caches.match(request)
        .then(function(match) {
            if (match !== undefined)
                return match;
            return fetch(request);
        });
}

self.addEventListener("install", function(e) {
    e.waitUntil(precache());
});

self.addEventListener("activate", function(e) {
    // Remove old cache.
    e.waitUntil(caches.keys()
        .then(function(keys) {
            return Promise.all(keys
                .filter(function(n) {
                    return n !== VIEWER_CACHE && n !== DATA_CACHE;
                })
                .map(function(n) {
                    return caches.delete(n);
                }));
        }));
});

self.addEventListener("fetch", function(e) {
    e.respondWith(fromCache(e.request));
});
