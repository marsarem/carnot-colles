"use strict";

var VIEWER_CACHE = "colles-viewer-v1";
var DATA_CACHE = "colles-data-v1";

function precache() {
    return Promise.all([
        caches.open(VIEWER_CACHE).then(function(c) {
            return c.addAll([
                "/",
                "/favicon.ico",
                "/icon.svg",
                "/manifest.webmanifest",
                "/apple-touch-icon.png",
            ]);
        }),
        caches.open(DATA_CACHE).then(function(c) {
            return c.addAll([
                "/data/mp-star.json",
                "/data/mpsi1.json",
                "/data/mpsi2.json",
                "/data/mpsi3.json",
                "/data/psi-star.json",
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
