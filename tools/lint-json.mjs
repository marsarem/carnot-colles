#!/usr/bin/node

'use strict'

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const INDENTATION_ADD = 2

const INLINE_PATHS = [
  /^\.groups\.[0-9]+\.program\.[0-9]+$/,
  /^\.groups\.[0-9]+\.perStudentProgram\.[0-9]+\.[0-9]+$/,
  /^\.subjects\.[0-9]+$/
]

function serializeJsonString (str) {
  return '"' + str.replaceAll(/(["\\])/g, '\\$1') + '"'
}

function serializeJson (object, state) {
  if (!state) {
    state = {
      currentIndentation: 0,
      currentPath: '',
      forceInline: false
    }
  };

  function recursive (items, open, close, spaceAroundItems, print, getKey) {
    if (items.length === 0) { return `${open}${close}` }

    const inline = INLINE_PATHS.some(regex => regex.test(state.currentPath))

    let itemsPrefix, itemsState, endPrefix
    if (inline) {
      itemsPrefix = ' '
      itemsState = {
        ...state,
        currentIndentation: 0,
        forceInline: true
      }
      endPrefix = ''
    } else {
      const itemsIndentation = state.currentIndentation + INDENTATION_ADD
      itemsPrefix = '\n' + ' '.repeat(itemsIndentation)
      itemsState = {
        ...state,
        currentIndentation: itemsIndentation
      }
      endPrefix = '\n' + ' '.repeat(state.currentIndentation)
    }

    let result = open
    result += inline ? spaceAroundItems : itemsPrefix
    for (let i = 0; i < items.length; i++) {
      if (i !== 0) { result += itemsPrefix }
      const itemState = {
        ...itemsState,
        currentPath: `${state.currentPath}.${getKey(items, i)}`
      }
      result += print(items[i], itemState)
      if (i !== items.length - 1) { result += ',' }
    }
    result += inline ? spaceAroundItems : endPrefix
    result += close

    return result
  }

  if (object === null) {
    return 'null'
  } else if (typeof object === 'number') {
    return object.toString()
  } else if (typeof object === 'string') {
    return serializeJsonString(object)
  } else if (Array.isArray(object)) {
    return recursive(object, '[', ']', '', serializeJson, (_, i) => i)
  } else if (typeof object === 'object') {
    return recursive(Object.entries(object), '{', '}', ' ',
      ([k, v], itemState) => `${serializeJsonString(k)}: ${serializeJson(v, itemState)}`,
      (entries, i) => entries[i][0])
  } else {
    throw new Error('unsupported object type')
  }
}

async function formatFile (file) {
  const json = JSON.parse(await fs.readFile(file, 'utf8'))
  await fs.writeFile(file, serializeJson(json) + '\n', 'utf8')
}

async function main () {
  const scriptLocation = path.dirname(fileURLToPath(import.meta.url))
  const directory = path.join(path.dirname(scriptLocation), 'classes')
  const files = await fs.readdir(directory)

  const promises = []
  for (const file of files) { promises.push(formatFile(path.join(directory, file))) }
  await Promise.all(promises)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
