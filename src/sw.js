"use strict";

var URL_PREFIX = "/carnot-colles";

var VIEWER_CACHE = "colles-viewer-v1";
var DATA_CACHE = "colles-data-v1";

function prefixURLs(urls) {
    return urls.map(function(u) {
        return URL_PREFIX + u;
    });
}

function precache() {
    return Promise.all([
        caches.open(VIEWER_CACHE).then(function(c) {
            return c.addAll(prefixURLs([
                "/",
                "/apple-touch-icon.png",
                "/favicon.ico",
                "/icon-16.png",
                "/icon-32.png",
                "/icon-192.png",
                "/icon-512.png",
                "/manifest.webmanifest",
            ]));
        }),
        caches.open(DATA_CACHE).then(function(c) {
            return c.addAll(prefixURLs([
                "/data/mp-star.json",
                "/data/mpsi1.json",
                "/data/mpsi2.json",
                "/data/mpsi3.json",
                "/data/psi-star.json",
            ]));
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
