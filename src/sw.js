/* eslint-env serviceworker */

'use strict'

// Including a disgest of the resources in the cache key makes the Service
// Worker script change every time the resources change, which tells the
// browser to update it. Upon installation, the new Service Worker will delete
// all caches whose key doesn't match this one so it will effectively replace
// the old cache with the new one.
const CACHE_KEY = 'colles-viewer-{{ resourceDigest }}'

const URL_PREFIX = '{{ urlPrefix }}'

/**
 * Precaches the viewer's code and data.
 * @returns {Promise} a promise that resolves when it's done
 */
async function precache () {
  const cache = await caches.open(CACHE_KEY)
  const URLS = [
    '',
    'apple-touch-icon.png',
    'classes.json',
    'favicon.ico',
    'icon-16.png',
    'icon-32.png',
    'icon-192.png',
    'icon-512.png',
    'manifest.webmanifest'
  ].map(u => URL_PREFIX + u)
  await cache.addAll(URLS)
}

/**
 * Delete caches from older service workers.
 * @returns {Promise} a promise that resolves when it's done
 */
async function deleteOldCaches () {
  const keys = await caches.keys()
  await Promise.all(keys.filter(k => k !== CACHE_KEY)
    .map(k => caches.delete(k)))
}

/**
 * Try to respond to the request with the cache first, and then if the cache
 * does not have the resource, then fetch it from the network.
 * @param {RequestInfo} request the request
 * @returns a promise with the response
 */
async function tryCacheThenNetwork (request) {
  const match = await caches.match(request)
  if (match !== undefined) { return match }
  return await fetch(request)
}

/**
 * Replaces the cache for the viewer HTML with the given HTML.
 * @param {string} html the document's innerHTML
 * @returns {Promise} a promise that resolves when it's done
 */
async function savePreRenderedViewer (html) {
  const cache = await caches.open(CACHE_KEY)
  const page = '<!doctype html><html>' + html + '</html>'
  await cache.put(URL_PREFIX, new Response(page, {
    headers: { 'content-type': 'text/html' }
  }))
}

self.addEventListener('install', function (e) {
  e.waitUntil(precache()
    .then(function () {
      // Force the update right now (do not wait until all tabs are closed). This
      // is fine as the tabs tabs themselves will reload the page so there is no
      // risk of mixing old and new assets.
      self.skipWaiting()
    }))
})

self.addEventListener('activate', function (e) {
  // Take control of all clients. Although self.skipWaiting() forces an
  // update from an old version to a new one, it would only apply to new page
  // loads without this.
  self.clients.claim()

  e.waitUntil(deleteOldCaches())
})

self.addEventListener('fetch', function (e) {
  e.respondWith(tryCacheThenNetwork(e.request))
})

self.addEventListener('message', function (e) {
  savePreRenderedViewer(e.data)
})
