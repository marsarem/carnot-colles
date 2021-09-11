/* eslint-env browser */
/* eslint-disable no-var */
/* eslint-disable no-extend-native */

'use strict'

/********************************
 * Reading data file
 ********************************/

var DATA_FORMAT = {
  classes: 0,
  groups: 1,
  students: 2,
  subjects: 3,
  teachers: 4,
  rooms: 5,
  times: 6,
  weeks: 7,
  searchIndex: 8
}

var COLLE_STATE = {
  done: 0,
  soon: 1,
  normal: 2
}

/**
 * Decodes a string into an integer array.
 * @param {string} str the string to decode
 * @returns the integer array
 */
function decodeIntegerArray (str) {
  var result = []
  var n = 0
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c >= 48 && c <= 57) {
      n += c - 48
    } else if (c >= 97 && c <= 122) {
      n += c - 97 + 10
    } else if (c >= 65 && c <= 90) {
      n += c - 65 + 36
    } else if (c === 33) {
      n += 62
    } else if (c >= 35 && c <= 47) {
      n += c - 35 + 63
    } else if (c >= 58 && c <= 64) {
      n += c - 58 + 76
    } else if (c === 91) {
      n += 83
    } else if (c >= 93 && c <= 96) {
      n += c - 93 + 84
    } else if (c >= 123 && c <= 125) {
      n += c - 123 + 88
    } else if (c === 126) {
      n += 91
      continue
    } else {
      throw new Error('invalid string')
    }
    result.push(n)
    n = 0
  }
  return result
}

/**
 * @see decodeIntegerArray
 * @param {string} str the string to decode
 * @returns the array of integer arrays
 */
function decodeArrayOfIntegerArrays (str) {
  return str.split(' ').map(decodeIntegerArray)
}

function getColleState (now, startingTime) {
  if (now - startingTime >= 1000 * 60 * 60) { return COLLE_STATE.done }
  if (startingTime - now <= 1000 * 60 * 60) { return COLLE_STATE.soon }
  return COLLE_STATE.normal
}

/**
 * Creates an intermediate representation of the student's program for a given
 * student, that will be used later to create DOM elements.
 * @param {object} globalData the data.json file's contents as an object
 * @param {number} studentIndex the student's index in the `globalData`
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the student's program as an array of weeks
 */
function computeStudentProgram (globalData, studentIndex, now) {
  var student = globalData[DATA_FORMAT.students][studentIndex]
  var groupIndex = student[0]
  var group = globalData[DATA_FORMAT.groups][groupIndex]
  var classIndex = group[0]
  var clazz = globalData[DATA_FORMAT.classes][classIndex]
  var classWeeks = decodeIntegerArray(clazz[2])
  var classColles = decodeArrayOfIntegerArrays(clazz[1])
  var classSubjectUrls = clazz[3]

  var result = []

  var groupProgram = decodeArrayOfIntegerArrays(group[2])
  for (var weekIndex = 0; weekIndex < groupProgram.length; weekIndex++) {
    var week = globalData[DATA_FORMAT.weeks][classWeeks[weekIndex]]

    var weekParts = week.split('-', 3)
    var weekYear = parseInt(weekParts[0])
    var weekMonth = parseInt(weekParts[1])
    var weekDay = parseInt(weekParts[2])

    var program = groupProgram[weekIndex]
    if (student.length >= 3) {
      var weekOverrides = student[2]
      var copied = false
      for (var i = 0; i < weekOverrides.length; i++) {
        var o = weekOverrides[i]

        var thisWeek = o[0]
        if (thisWeek !== weekIndex) { continue }

        var index = o[1]
        var newColle = o[2]

        if (!copied) {
          program = program.slice()
          copied = true
        }

        if (index === -1) {
          program.push(newColle)
        } else if (newColle !== -1) {
          program[index] = newColle
        } else {
          program.splice(index, 1)
        }
      }
    }

    var programFormatted = []

    var isAllDone = true
    for (i = 0; i < program.length; i++) {
      index = program[i]
      var colle = classColles[index]

      var subjectIndex = colle[0]

      var day = colle[2]
      var time = globalData[DATA_FORMAT.times][colle[3]]
      var timeParts = time.split(':', 2)
      var hours = parseInt(timeParts[0])
      var minutes = parseInt(timeParts[1])
      var startingTime = new Date(weekYear, weekMonth - 1, weekDay + day, hours, minutes).valueOf()

      var state = getColleState(now, startingTime)
      if (state !== COLLE_STATE.done) { isAllDone = false }

      programFormatted.push({
        subjectIndex: subjectIndex,
        subject: globalData[DATA_FORMAT.subjects][subjectIndex],
        subjectUrl: classSubjectUrls ? classSubjectUrls[subjectIndex] : undefined,
        teacher: globalData[DATA_FORMAT.teachers][colle[1]],
        room: colle.length >= 5 ? globalData[DATA_FORMAT.rooms][colle[4]] : undefined,
        day: day,
        hours: hours,
        minutes: minutes,
        startingTime: startingTime,
        state: state
      })
    }

    // Do not show weeks that have already ended.
    if (isAllDone) { continue }

    result.push({
      index: weekIndex,
      year: weekYear,
      month: weekMonth,
      day: weekDay,
      program: programFormatted
    })
  }

  return result
}

/********************************
 * Search
 ********************************/

/**
 * Returns the index of the student that best matches the search query, or -1
 * if there is not any.
 * @param {string} query the user's query
 * @param {object} globalData the data.json file's contents as an object
 * @returns the index of the student that best matches the search query
 */
function performSearch (query, globalData) {
  // This code is duplicated in lib/mk-search-index.mjs. For now this is fine
  // because the amount of code duplicated is low and adding a JS bundler is
  // not really wanted (it would add more complexity and a dependency that we
  // have to track versions of).
  var tokens = query
    .toLowerCase()
  // Remove accents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\W+/g)
  // Remove things like "D'"
    .filter(function (w) {
      return w.length >= 2
    })

  if (!tokens.length) { return -1 }

  // Sort the tokens so that the largest one first. It makes more sense to
  // match the largest one first and then precise the query with smaller
  // tokens.
  tokens.sort(function (a, b) {
    return b.length - a.length
  })

  function getMatches (needle) {
    var matches = []

    var firstChar = needle[0]
    var searchIndex = globalData[DATA_FORMAT.searchIndex][firstChar]
    for (var haystack in searchIndex) {
      if (haystack.startsWith(needle)) { matches.push(haystack) }
    }

    // Sort the matches so that the first match is the token with the
    // shortest length. Let's say we have to names "Greg" and "Gregory". If
    // the user types "greg", we want to match with "Greg" first and then
    // let them add more characters if that match wasn't correct. If we did
    // not do this, then it would be impossible to search for "Greg."
    matches.sort(function (a, b) {
      return a.length - b.length
    })

    var indices = []
    for (var i = 0; i < matches.length; i++) {
      var m = searchIndex[matches[i]]
      for (var j = 0; j < m.length; j++) { indices.push(m[j]) }
    }
    return indices
  }

  function intersection (arr1, arr2) {
    for (var i = arr1.length - 1; i >= 0; i--) {
      if (arr2.indexOf(arr1[i]) === -1) { arr1.splice(i, 1) }
    }
  }

  var candidates = getMatches(tokens[0])
  for (var i = 1; i < tokens.length && candidates.length; i++) { intersection(candidates, getMatches(tokens[i])) }

  return candidates.length > 0 ? candidates[0] : -1
}

/********************************
 * Relative time formatting
 ********************************/

/**
 * Converts a difference between two {@code Date}s into a human
 * readable string in French.
 * @param {number} from the starting date as a UNIX timestamp in milliseconds
 * @param {number} to the target date as a UNIX timestamp in milliseconds
 */
function formatRelativeTime (from, to) {
  var diffMs = to - from
  var diffAbsMs = Math.abs(diffMs)

  function doNumeric (value, label) {
    var n = Math.abs(value)
    var result = (value > 0 ? 'dans ' : 'il y a ') + n + ' ' + label
    if (n > 1) { result += 's' }
    return result
  }

  var MINUTE_MS = 1000 * 60
  var HOUR_MS = MINUTE_MS * 60
  var DAY_MS = HOUR_MS * 24

  if (diffAbsMs < MINUTE_MS) {
    return 'maintenant'
  } else if (diffAbsMs < 2 * HOUR_MS) {
    return doNumeric(Math.round(diffMs / MINUTE_MS), 'minute')
  } else {
    // First take the difference in actual days between the two
    // time points.
    var diffDays = Math.trunc(diffMs / DAY_MS)
    // Then increment the count if midnight has passed between
    // from + diffDays * DAY_MS and to. In French, when we talk
    // a difference in days, we are actually talking about the
    // count of midnights between the two times. This code will
    // correct for this.
    var timeOfDayFrom = from % DAY_MS
    var timeOfDayTo = to % DAY_MS
    if (diffMs > 0 && timeOfDayTo < timeOfDayFrom) {
      diffDays++
    } else if (diffMs < 0 && timeOfDayFrom < timeOfDayTo) {
      diffDays--
    }
    if (diffDays === 0) {
      return doNumeric(Math.round(diffMs / HOUR_MS), 'heure')
    } else if (diffDays === -2) {
      return 'avant-hier'
    } else if (diffDays === -1) {
      return 'hier'
    } else if (diffDays === 1) {
      return 'demain'
    } else if (diffDays === 2) {
      return 'après-demain'
    }
    return doNumeric(diffDays, 'jour')
  }
}

/********************************
 * DOM
 ********************************/

var LOCAL_STORAGE_KEYS = {
  query: 'colles-viewer__query'
}

var DATA_ATTRS = {
  timestamp: 'data-timestamp',
  studentIndex: 'data-student-index'
}

var COLLE_STATE_CLASSES = [
  'c-colle--done',
  'c-colle--soon',
  'c-colle--normal'
]

var LOADING_MSG = 'Chargement en cours...'

var uniqueCounter = 0

var hasFailed = false

var updateTimerHandle = null
var scheduleCacheTimerHandle = null

/**
 * If the user had already visited the site and searched for the program of a
 * student, then return the name of that student.
 * @returns {string} the last query
 */
function getLastQuery () {
  if (!('localStorage' in window)) { return null }
  return localStorage.getItem(LOCAL_STORAGE_KEYS.query)
}

/**
 * Makes a colle DOM element.
 * @param {object} colle the colle
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the DOM element
 */
function makeColleHtml (colle, now) {
  var $colle = document.createElement('li')
  $colle.classList.add('c-colle')
  $colle.classList.add('c-padding-top')
  $colle.classList.add(COLLE_STATE_CLASSES[colle.state])

  // This is done this way instead of constructing a string with the number
  // since we are going to text replace the classes so they need to be
  // hardcoded.
  var SUBJECT_CLASSES = [
    'c-colle--subject-0',
    'c-colle--subject-1',
    'c-colle--subject-2',
    'c-colle--subject-3',
    'c-colle--subject-4',
  ]
  $colle.classList.add(SUBJECT_CLASSES[colle.subjectIndex % SUBJECT_CLASSES.length])

  var $subject = document.createElement('strong')
  if (colle.subjectUrl !== undefined) {
    var $link = document.createElement('a')
    $link.classList.add('c-colle__link')
    $link.textContent = 'programme'
    $link.href = colle.subjectUrl
    $link.target = '_blank'
    // Do not tell the target site that the user is coming from this page for privacy.
    if ($link.referrerPolicy !== undefined) { $link.referrerPolicy = 'no-referrer' }
    // Avoid using the window.opener API.
    if ($link.rel !== undefined) { $link.rel = 'noreferrer noopener' }

    $subject.appendChild(document.createTextNode(colle.subject + ' ('))
    $subject.appendChild($link)
    $subject.appendChild(document.createTextNode(')'))
  } else {
    $subject.textContent = colle.subject
  }
  $colle.appendChild($subject)

  var DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  var day = DAYS[colle.day]

  $colle.appendChild(document.createElement('br'))
  $colle.appendChild(document.createTextNode(colle.teacher))

  if (colle.room !== undefined) {
    $colle.appendChild(document.createElement('br'))
    $colle.appendChild(document.createTextNode('Salle ' + colle.room))
  }

  $colle.appendChild(document.createElement('br'))
  $colle.appendChild(document.createTextNode(day + ' à ' +
        colle.hours + 'h' +
        (colle.minutes < 10 ? '0' + colle.minutes : colle.minutes) +
        ' ('))

  var $relativeTime = document.createElement('span')
  $relativeTime.classList.add('c-colle__relative-time')
  $relativeTime.textContent = formatRelativeTime(now, colle.startingTime)
  $relativeTime.setAttribute(DATA_ATTRS.timestamp, colle.startingTime)
  $colle.appendChild($relativeTime)

  $colle.appendChild(document.createTextNode(')'))

  return $colle
}

/**
 * Makes a week DOM element.
 * @param {object} week the week information
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the DOM element
 */
function makeWeekHtml (week, now) {
  var $week = document.createElement('section')
  $week.classList.add('c-week')
  $week.classList.add('c-padding-top')

  // Generate a unique ID for the week to identify it.
  $week.id = 'week-' + uniqueCounter++

  var $weekTitle = document.createElement('h2')
  $weekTitle.textContent = 'Semaine ' + (week.index + 1) + ' (' + week.day + '/' + week.month + ')'
  $week.appendChild($weekTitle)

  var $colles = document.createElement('ul')
  $colles.classList.add('c-week__colles')
  $colles.classList.add('c-padding-top')
  for (var i = 0; i < week.program.length; i++) { $colles.appendChild(makeColleHtml(week.program[i], now)) }
  $week.appendChild($colles)

  return $week
}

/**
 * Performs a search using the value in the student name field and update the
 * UI with the results.
 * @param {object} globalData the data.json file's contents as an object
 * @param {string} query the user's query
 */
function updateUI (globalData, query) {
  var $infoDiv = document.getElementById('i-info')

  if (globalData === null || !query) {
    $infoDiv.classList.add('c-hide')
    return
  }

  var studentIndex = performSearch(query, globalData)
  if (studentIndex === -1) {
    $infoDiv.classList.add('c-hide')
    return
  }

  // Do not recompute everything if possible.
  if ($infoDiv.getAttribute(DATA_ATTRS.studentIndex) === studentIndex.toString()) {
    $infoDiv.classList.remove('c-hide')
    return
  }

  var student = globalData[DATA_FORMAT.students][studentIndex]
  var groupIndex = student[0]
  var group = globalData[DATA_FORMAT.groups][groupIndex]
  var classIndex = group[0]
  var clazz = globalData[DATA_FORMAT.classes][classIndex]

  document.getElementById('i-name').textContent = student[1]
  document.getElementById('i-class').textContent = clazz[0]
  document.getElementById('i-group-nr').textContent = group[1]

  var now = new Date().valueOf()
  var program = computeStudentProgram(globalData, studentIndex, now)

  var $program = document.getElementById('i-program')

  // Remove all children
  $program.innerHTML = ''

  // Append new children
  var fragment = document.createDocumentFragment()
  for (var i = 0; i < program.length; i++) { $program.appendChild(makeWeekHtml(program[i], now)) }
  $program.appendChild(fragment)

  $infoDiv.classList.remove('c-hide')
  $infoDiv.setAttribute(DATA_ATTRS.studentIndex, studentIndex)
}

/**
 * Updates relative times on DOM elements on the page.
 */
function updateRelativeTimes () {
  var weeks = {}
  var now = new Date().valueOf()

  var $spans = document.getElementsByClassName('c-colle__relative-time')
  for (var i = 0; i < $spans.length; i++) {
    var $span = $spans[i]
    var $colle = $span.parentElement

    var timestamp = parseInt($span.getAttribute(DATA_ATTRS.timestamp))

    var newState = getColleState(now, timestamp)
    var newStateClass = COLLE_STATE_CLASSES[newState]
    if (!$colle.classList.contains(newStateClass)) {
      for (var j = 0; j < COLLE_STATE_CLASSES.length; j++) { $colle.classList.remove(COLLE_STATE_CLASSES[j]) }
      $colle.classList.add(newStateClass)
    }

    var $week = $colle.parentElement.parentElement
    if ($week.id in weeks) {
      weeks[$week.id].allDone &= newState === COLLE_STATE.done
    } else {
      weeks[$week.id] = {
        $week: $week,
        allDone: newState === COLLE_STATE.done
      }
    }

    $span.textContent = formatRelativeTime(now, timestamp)
  }

  for (var id in weeks) {
    var week = weeks[id]
    if (week.allDone) { week.$week.parentElement.removeChild(week.$week) }
  }
}

function scheduleUpdateRelativeTimes () {
  var MARGIN_MS = 200
  var secondsUntilNextMinute = 59 - new Date().getSeconds()

  updateTimerHandle = setTimeout(function () {
    updateRelativeTimes()
    scheduleUpdateRelativeTimes()
  }, 1000 * secondsUntilNextMinute + MARGIN_MS)
}

/**
 * Displays the specified message at the top of the page, or removes the
 * message if `null` is given as an argument.
 * @param {string|null} msg the status message to show
 */
function showStatus (msg) {
  var $status = document.getElementById('i-status')
  if (msg === null) {
    $status.textContent = ''
    $status.classList.add('c-hide')
  } else {
    $status.textContent = msg
    $status.classList.remove('c-hide')
  }
}

function earlyInit () {
  var $infoDiv = document.getElementById('i-info')

  var alreadyLoaded = $infoDiv.getAttribute(DATA_ATTRS.studentIndex) !== null
  if (alreadyLoaded) {
    // Search results have been pre-rendered so we have to update the
    // relative times and maybe remove weeks that are already finished.
    updateRelativeTimes()
  } else {
    var $query = document.getElementById('i-query')

    var lastQuery = getLastQuery()
    if (lastQuery !== null) {
      $query.value = lastQuery
      showStatus(LOADING_MSG)
    }
  }
}

function laterInit () {
  var $infoDiv = document.getElementById('i-info')
  var $query = document.getElementById('i-query')

  var query = $query.value
  var globalData = null
  var alreadyLoaded = $infoDiv.getAttribute(DATA_ATTRS.studentIndex) !== null

  fetch('{{ urlBase }}classes.json', { credentials: 'same-origin', mode: 'cors' })
    .then(function (response) {
      if (!response.ok) { throw new Error('response is not OK') }
      return response.json()
    })
    .then(function (json) {
      if (hasFailed) { return }

      globalData = json

      if (!alreadyLoaded) {
        updateUI(globalData, query)
        showStatus(null)
        scheduleCacheDocumentHtml()
      }
    })

  $query.addEventListener('input', function () {
    if (hasFailed || $query.value === query) { return }

    // Remember the name for when the page is opened again.
    if (window.localStorage) { localStorage.setItem(LOCAL_STORAGE_KEYS.query, $query.value) }

    query = $query.value

    if (globalData === null) {
      if (query) {
        alreadyLoaded = false
        showStatus(LOADING_MSG)
      } else {
        showStatus(null)
      }
    }

    updateUI(globalData, query)
    scheduleCacheDocumentHtml()
  })

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      updateRelativeTimes()
      if (updateTimerHandle === null) { scheduleUpdateRelativeTimes() }
    } else if (updateTimerHandle !== null) {
      clearTimeout(updateTimerHandle)
      updateTimerHandle = null
    }
  })

  scheduleUpdateRelativeTimes()
}

/********************************
 * Polyfills
 ********************************/

/**
 * Registers a listener to catch exceptions that are not in a try catch block
 * and display a message to the user.
 */
function registerErrorHandler () {
  window.addEventListener('error', function () {
    hasFailed = true
    document.getElementById('i-form').classList.add('c-hide')
    document.getElementById('i-info').classList.add('c-hide')
    showStatus('Une erreur est survenue !')
  })
}

function runLowPriority (cb, timeout) {
  if (!('requestIdleCallback' in window)) {
    cb()
    return
  }
  requestIdleCallback(cb, { timeout: timeout })
}

/**
 * Loads polyfills for JS features that are required and that the browser does
 * not support.
 * @param {function} cb function that will be called when polyfills are loaded
 */
function loadPolyfills (cb) {
  if (!('trunc' in Math)) {
    Object.defineProperty(Math, 'trunc', {
      value: function (v) {
        return v < 0 ? Math.ceil(v) : Math.floor(v)
      }
    })
  }

  if (!('startsWith' in String.prototype)) {
    Object.defineProperty(String.prototype, 'startsWith', {
      value: function (search, rawPos) {
        var pos = rawPos > 0 ? rawPos | 0 : 0
        return this.substring(pos, pos + search.length) === search
      }
    })
  }

  var polyfills = []
  if (!('Promise' in window)) { polyfills.push('https://cdn.jsdelivr.net/npm/promise-polyfill@8.2.0/dist/polyfill.min.js') }
  if (!('fetch' in window)) { polyfills.push('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.5.0/dist/fetch.umd.js') }
  if (!('normalize' in String.prototype)) { polyfills.push('https://cdn.jsdelivr.net/npm/unorm@1.6.0/lib/unorm.js') }

  var remaining = polyfills.length
  if (remaining === 0) {
    cb()
    return
  }

  for (var i = 0; i < remaining; i++) {
    var $script = document.createElement('script')
    $script.src = polyfills[i]
    $script.onload = function (e) {
      remaining--
      if (remaining === 0) { cb() }
    }
    $script.onerror = function (e) {
      console.error('failed to load polyfill', e)
    }
    document.head.appendChild($script)
  }
}

/********************************
 * Service Worker
 ********************************/

/**
 * Sends the current document's innerHTML to the Service Worker so that the
 * next time the client sends a request with the viewer page, we send this
 * HTML.
 */
function cacheDocumentHtml () {
  if ('serviceWorker' in navigator) {
    var controller = navigator.serviceWorker.controller
    if (controller !== null) {
      // Make sure to save the state of the input.
      var $query = document.getElementById('i-query')
      $query.setAttribute('value', $query.value)

      controller.postMessage(document.documentElement.innerHTML)
    }
  }
}

function scheduleCacheDocumentHtml () {
  var TIMEOUT = 400
  if ('requestIdleCallback' in window) {
    if (scheduleCacheTimerHandle !== null) { cancelIdleCallback(scheduleCacheTimerHandle) }
    scheduleCacheTimerHandle = requestIdleCallback(cacheDocumentHtml, { timeout: TIMEOUT })
  } else {
    cacheDocumentHtml()
  }
}

/**
 * Tries to register the service worker that makes the site available offline.
 */
function registerServiceWorker () {
  if (!('serviceWorker' in navigator)) { return }

  // Immediatly reload the page when the service worker is updated.
  // This is fine since the query is stored in localStorage and therefore
  // after the refresh the page will still show the same information (no
  // user interruption).
  var canRefresh = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (canRefresh) {
      window.location.reload()
      canRefresh = false
    }
  })

  navigator.serviceWorker.register('{{ urlBase }}/sw.js')
    .then(function (sw) {
      scheduleCacheDocumentHtml()

      // Force check for updates when the page is loaded or when the
      // PWA is brought to foreground. We really don't want to show
      // stale information or else a student might miss a schedule
      // update!
      var lastUpdate = new Date().valueOf()
      sw.update()
      document.addEventListener('visibilitychange', function () {
        var now = new Date().valueOf()
        var UPDATE_THROTTLE = 1000 * 60 * 60
        if (document.visibilityState === 'visible' &&
                    now - lastUpdate >= UPDATE_THROTTLE) {
          sw.update()
          lastUpdate = now
        }
      })
    })
}

/********************************
 * Entry point
 ********************************/

registerErrorHandler()
earlyInit()
runLowPriority(function () {
  loadPolyfills(laterInit)
  registerServiceWorker()
}, 200)
