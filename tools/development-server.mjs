#!/usr/bin/node

'use strict'

import childProcess from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

import chokidar from 'chokidar'

/**
 * Runs the script that builds a distribution of the website and makes sure
 * that there aren't multiple instances running at a time.
 */
class Builder {
  constructor (buildScript) {
    this._buildScript = buildScript
    this._isScriptRunning = false
    this._promises = []
  }

  scheduleBuild () {
    return new Promise((resolve, reject) => {
      this._promises.push({ resolve, reject })
      this._process()
    })
  }

  _process () {
    if (this._isScriptRunning || this._promises.length === 0) { return }

    // Take pending promises.
    const promises = this._promises
    this._promises = []

    this._runScript()
      .then(() => {
        for (const promise of promises) {
          promise.resolve()
        }
        this._isScriptRunning = false
        this._process()
      })
      .catch(err => {
        for (const promise of promises) {
          promise.reject(err)
        }
        this._isScriptRunning = false
        this._process()
      })
    this._isScriptRunning = true
  }

  _runScript () {
    return new Promise((resolve, reject) => {
      let cbInvoked = false

      const process = childProcess.fork(this._buildScript)
      process.on('error', err => {
        if (cbInvoked) return
        reject(err)
        cbInvoked = true
      })
      process.on('exit', exitCode => {
        if (cbInvoked) return
        if (exitCode === 0) {
          resolve()
        } else {
          reject(new Error(`non-zero exit code: ${exitCode}`))
        }
        cbInvoked = true
      })
    })
  }
}

/**
 * Serves pages and resources from a directory via HTTP.
 */
class HttpStaticServer {
  constructor (root) {
    this._root = path.normalize(root)
    this._http = http.createServer(this._onRequest.bind(this))
    this._isListening = false
  }

  listenOnRandomPort () {
    if (this._isListening) { return Promise.resolve(this._http.address().port) }
    this._isListening = true

    return new Promise((resolve, reject) => {
      const errorHandler = err => {
        this._http.removeListener('error', errorHandler)
        this._isListening = false
        reject(err)
      }
      this._http.on('error', errorHandler)
      this._http.listen(0, () => {
        this._http.removeListener('error', errorHandler)
        resolve(this._http.address().port)
      })
    })
  }

  _onRequest (req, res) {
    if (req.method !== 'GET') {
      res.end('Invalid method.')
      return
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'example.com'}`)
    if (url.pathname.includes('\0') || !/^[a-z0-9./]+$/.test(url.pathname)) {
      res.end('Invalid characters in URL.')
      return
    }

    const localPath = path.normalize(path.join(this._root, url.pathname))
    if (!localPath.startsWith(this._root)) {
      res.end('File is outside of public directory.')
      return
    }

    function printError (err) {
      res.end('Failed to read file.')
      console.error('Failed to read file:', err)
    }

    let stream = fs.createReadStream(localPath)
    stream.once('error', err => {
      if (err.code === 'EISDIR') {
        // Retry with the `index.html` file.
        const indexPath = path.join(localPath, 'index.html')
        stream = fs.createReadStream(indexPath)
        stream.once('error', printError)
        stream.pipe(res)
      } else {
        printError(err)
      }
    })
    stream.pipe(res)
  }
}

async function main () {
  const scriptLocation = path.dirname(fileURLToPath(import.meta.url))
  const root = path.dirname(scriptLocation)

  const buildScript = path.join(scriptLocation, 'build.mjs')
  const builder = new Builder(buildScript)
  try {
    // Initial build.
    await builder.scheduleBuild()
    console.log('initial build succeeded')
  } catch (err) {
    console.error('initial build failed:', err)
  }

  const watcher = chokidar.watch([
    path.join(root, 'classes'),
    path.join(root, 'lib'),
    path.join(root, 'src'),
    path.join(root, 'tools')
  ])
  let buildTimerHandle = null
  watcher.on('change', () => {
    if (buildTimerHandle !== null) { clearTimeout(buildTimerHandle) }
    buildTimerHandle = setTimeout(() => {
      builder.scheduleBuild()
        .then(() => console.log('build succeeded'))
        .catch(err => console.error('build failed:', err))
    }, 300)
  })

  const distRoot = path.join(root, 'dist')
  const server = new HttpStaticServer(distRoot)
  console.log(`URL: http://localhost:${await server.listenOnRandomPort()}/`)
}

main()
