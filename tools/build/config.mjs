'use strict'

export default function getBuildConfig() {
  return {
    urlBase: process.env.URL_BASE ?? '/',
    canonical: process.env.CANONICAL ?? 'https://example.com/'
  }
}
