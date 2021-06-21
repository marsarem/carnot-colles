'use strict'

import crypto from 'crypto'

export default class BuildDigest {
  constructor() {
    this._files = []
  }

  addFile(name, content) {
    this._files.push({ name, content })
  }

  hash() {
    // To make the hash deterministic, sort the files by name.
    this._files.sort((a, b) => a.name.localeCompare(b.name))

    const hash = crypto.createHash('sha256')
    for (const { _, content } of this._files) { hash.update(content) }
    return hash.digest('base64')
  }
}
