(function() {

"use strict";

var LOCAL_STORAGE_QUERY = "colles-viewer__query";
var TIMESTAMP_ATTR = "a";
var STUDENT_INDEX_ATTR = "a";

/**
 * Long living DOM elements
 */

var QUERY = document.getElementById("i-query");
var FORM = document.getElementById("i-form");
var LOADER = document.getElementById("i-loader");
var ERROR = document.getElementById("i-error");
var INFO_DIV = document.getElementById("i-info");
var STUDENT_NAME = document.getElementById("i-name");
var STUDENT_CLASS = document.getElementById("i-class");
var GROUP_NR = document.getElementById("i-group-nr");
var PROGRAM = document.getElementById("i-program");

/**
 * The data.json file's content as an object, or `null` before it is finished
 * loading.
 */
var DATA = null;

var CLASSES = 0;
var GROUPS = 1;
var STUDENTS = 2;
var SUBJECTS = 3;
var TEACHERS = 4;
var ROOMS = 5;
var TIMES = 6;
var WEEKS = 7;
var SEARCH_INDEX = 8;

/**
 * The index of the student's whose information is currently being displayed.
 * If the user edits the query and the search result is unchanged (the same
 * student is being shown), then we will know it and we will not recompute the
 * DOM.
 */
var currStudentIndex = -1;

/**
 * Fetches the data.json file's content.
 * @returns a promise with the data as an object
 */
function fetchData() {
    return fetch("data.json", { credentials: "same-origin", mode: "cors" })
        .then(function(response) {
            if (!response.ok)
                throw new Error("response is not OK");
            return response.json();
        })
}

/**
 * Decodes a string into an integer array.
 * @param {string} str the string to decode
 * @returns the integer array
 */
function decodeIntegerArray(str) {
    var result = [];
    var n = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c >= 48 && c <= 57) {
            n += c - 48;
        } else if (c >= 97 && c <= 122) {
            n += c - 97 + 10;
        } else if (c >= 65 && c <= 90) {
            n += c - 65 + 36;
        } else if (c === 33) {
            n += 62;
        } else if (c >= 35 && c <= 47) {
            n += c - 35 + 63;
        } else if (c >= 58 && c <= 64) {
            n += c - 58 + 76;
        } else if (c === 91) {
            n += 83;
        } else if (c >= 93 && c <= 96) {
            n += c - 93 + 84;
        } else if (c >= 123 && c <= 125) {
            n += c - 123 + 88;
        } else if (c === 126) {
            n += 91;
            continue;
        } else {
            throw new Error("invalid string");
        }
        result.push(n);
        n = 0;
    }
    return result;
}

/**
 * @see decodeIntegerArray
 * @param {string} str the string to decode
 * @returns the array of integer arrays
 */
function decodeArrayOfIntegerArrays(str) {
    return str.split(" ").map(decodeIntegerArray);
}

/**
 * If the user had already visited the site and searched for the program of a
 * student, then set the value of the name field to the name of that student,
 * so that they do not have to type it again (the site remembers it).
 */
function autoFillQuery() {
    if (!("localStorage" in window))
        return;
    var query = localStorage.getItem(LOCAL_STORAGE_QUERY);
    if (query === null)
        return;
    QUERY.value = query;
}

/**
 * Returns the index of the student that best matches the search query, or -1
 * if there is not any.
 * @returns the index of the student that best matches the search query
 */
function performSearch() {
    // This code is duplicated in lib/mk-search-index.mjs. For now this is fine
    // because the amount of code duplicated is low and adding a JS bundler is
    // not really wanted (it would add more complexity and a dependency that we
    // have to track versions of).
    var tokens = QUERY.value
        .toLowerCase()
        // Remove accents
        .normalize("NFD") 
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\W+/g)
        // Remove things like "D'"
        .filter(function(w) {
            return w.length >= 2;
        });
    
    if (!tokens.length)
        return -1;

    // Sort the tokens so that the largest one first. It makes more sense to
    // match the largest one first and then precise the query with smaller
    // tokens.
    tokens.sort(function(a, b) {
        return b.length - a.length;
    });

    function getMatches(needle) {
        var matches = [];

        var firstChar = needle[0];
        var searchIndex = DATA[SEARCH_INDEX][firstChar];
        for (var haystack in searchIndex) {
            if (haystack.startsWith(needle))
                matches.push(haystack);
        }

        // Sort the matches so that the first match is the token with the
        // shortest length. Let's say we have to names "Greg" and "Gregory". If
        // the user types "greg", we want to match with "Greg" first and then
        // let them add more characters if that match wasn't correct. If we did
        // not do this, then it would be impossible to search for "Greg."
        matches.sort(function(a, b) {
            return a.length - b.length;
        });

        var indices = [];
        for (var i = 0; i < matches.length; i++) {
            var m = searchIndex[matches[i]];
            for (var j = 0; j < m.length; j++)
                indices.push(m[j]);
        }
        return indices;
    }

    function intersection(arr1, arr2) {
        for (var i = 0; i < arr1.length; i++) {
            if (arr2.indexOf(arr1[i]) === -1)
                arr1.splice(i, 1);
        }
    }

    var candidates = getMatches(tokens[0]);
    for (var i = 1; i < tokens.length && candidates.length; i++) {
        intersection(candidates, getMatches(tokens[i]));
    }

    return candidates.length > 0 ? candidates[0] : -1;
}

/**
 * Relative time formatting
 */

var MINUTE_MS = 1000 * 60;
var HOUR_MS = MINUTE_MS * 60;
var DAY_MS = HOUR_MS * 24;

/**
 * Converts a difference between two {@code Date}s into a human
 * readable string in French.
 * @param {number} from the starting date as a UNIX timestamp in milliseconds
 * @param {number} to the target date as a UNIX timestamp in milliseconds
 */
function formatRelativeTime(from, to) {
    var diffMs = to - from;
    var diffAbsMs = Math.abs(diffMs);

    function doNumeric(value, label) {
        var n = Math.abs(value);
        var result = (value > 0 ? "dans " : "il y a ") + n + " " + label;
        if (n > 1)
            result += "s";
        return result;
    }

    if (diffAbsMs < MINUTE_MS) {
        return "maintenant";
    } else if (diffAbsMs < 2 * HOUR_MS) {
        return doNumeric(Math.round(diffMs / MINUTE_MS), "minute");
    } else {
        // First take the difference in actual days between the two
        // time points.
        var diffDays = Math.trunc(diffMs / DAY_MS);
        // Then increment the count if midnight has passed between
        // from + diffDays * DAY_MS and to. In French, when we talk
        // a difference in days, we are actually talking about the
        // count of midnights between the two times. This code will
        // correct for this.
        var timeOfDayFrom = from % DAY_MS;
        var timeOfDayTo = to % DAY_MS;
        if (diffMs > 0 && timeOfDayTo < timeOfDayFrom) {
            diffDays++;
        } else if (diffMs < 0 && timeOfDayFrom < timeOfDayTo) {
            diffDays--;
        }
        if (diffDays === 0) {
            return doNumeric(Math.round(diffMs / HOUR_MS), "heure");
        } else if (diffDays === -2) {
            return "avant-hier";
        } else if (diffDays === -1) {
            return "hier";
        } else if (diffDays === 1) {
            return "demain";
        } else if (diffDays === 2) {
            return "après-demain";
        }
        return doNumeric(diffDays, "jour");
    }
}

/**
 * Colle states.
 */
var STATE_DONE = 0;
var STATE_SOON = 1;
var STATE_NORMAL = 2;

/**
 * Makes a colle DOM element.
 * @param {object} colle the colle
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the DOM element
 */
function makeColleHtml(colle, now) {
    var $colle = document.createElement("li");
    $colle.classList.add("c-colle");
    $colle.classList.add("c-padding-top");
    $colle.classList.add(["c-colle--done", "c-colle--soon", "c-colle--normal"][colle.state]);

    // This is done this way instead of constructing a string with the number
    // since we are going to text replace the classes so they need to be
    // hardcoded.
    var STATE_CLASSES = ["c-colle--subject-0", "c-colle--subject-1", "c-colle--subject-2", "c-colle--subject-3"];
    $colle.classList.add(STATE_CLASSES[colle.subjectIndex % STATE_CLASSES.length]);

    var $subject = document.createElement("strong");
    if (colle.subjectUrl !== undefined) {
        var $link = document.createElement("a");
        $link.classList.add("c-colle__link");
        $link.textContent = "programme";
        $link.href = colle.subjectUrl;
        $link.target = "_blank";
        // Do not tell the target site that the user is coming from this page for privacy.
        if ($link.referrerPolicy !== undefined)
            $link.referrerPolicy = "no-referrer";
        // Avoid using the window.opener API.
        if ($link.rel !== undefined)
            $link.rel = "noreferrer noopener";

        $subject.appendChild(document.createTextNode(colle.subject + " ("));
        $subject.appendChild($link);
        $subject.appendChild(document.createTextNode(")"));
    } else {
        $subject.textContent = colle.subject;
    }
    $colle.appendChild($subject);

    var DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    var day = DAYS[colle.day];

    $colle.appendChild(document.createElement("br"));
    $colle.appendChild(document.createTextNode(colle.teacher));

    if (colle.room !== undefined) {
        $colle.appendChild(document.createElement("br"));
        $colle.appendChild(document.createTextNode("Salle " + colle.room));
    }

    $colle.appendChild(document.createElement("br"));
    $colle.appendChild(document.createTextNode(day + " à " +
        colle.hours + "h" +
        (colle.minutes < 10 ? "0" + colle.minutes : colle.minutes) +
        " ("));

    var $relativeTime = document.createElement("span");
    $relativeTime.classList.add("c-relative-time");
    $relativeTime.textContent = formatRelativeTime(now, colle.startingTime);
    $relativeTime.setAttribute(TIMESTAMP_ATTR, colle.startingTime);
    $colle.appendChild($relativeTime);

    $colle.appendChild(document.createTextNode(")"));

    return $colle;
}

/**
 * Makes a week DOM element.
 * @param {object} week the week information
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the DOM element
 */
function makeWeekHtml(week, now) {
    var $week = document.createElement("section");
    $week.classList.add("c-week");
    $week.classList.add("c-padding-top");

    var $weekTitle = document.createElement("h2");
    $weekTitle.textContent = "Semaine " + (week.index + 1) + " (" + week.day + "/" + week.month + ")";
    $week.appendChild($weekTitle);

    var $colles = document.createElement("ul");
    $colles.classList.add("c-week__colles");
    $colles.classList.add("c-padding-top");
    for (var i = 0; i < week.program.length; i++)
        $colles.appendChild(makeColleHtml(week.program[i], now));
    $week.appendChild($colles);

    // By hardcoding the height, we allow using CSS size containment on mobile
    // which improves layout performance.
    $week.style.height = (92 + 140 * week.program.length) + "px";

    return $week;
}

/**
 * Creates an intermediate representation of the student's program for a given
 * student, that will be used later to create DOM elements.
 * @param {number} studentIndex the student's index in the data file
 * @param {number} now the current date as a UNIX timestamp in milliseconds
 * @returns the student's program as an array of weeks
 */
function getColleProgramForStudent(studentIndex, now) {
    var student = DATA[STUDENTS][studentIndex];
    var groupIndex = student[0];
    var group = DATA[GROUPS][groupIndex];
    var classIndex = group[0];
    var clazz = DATA[CLASSES][classIndex];
    var classWeeks = decodeIntegerArray(clazz[2]);
    var classColles = decodeArrayOfIntegerArrays(clazz[1]);
    var classSubjectUrls = clazz[3];

    var result = [];

    var groupProgram = decodeArrayOfIntegerArrays(group[2]);
    for (var weekIndex = 0; weekIndex < groupProgram.length; weekIndex++) {
        var week = DATA[WEEKS][classWeeks[weekIndex]];

        var weekParts = week.split("-", 3);
        var weekYear = parseInt(weekParts[0]);
        var weekMonth = parseInt(weekParts[1]);
        var weekDay = parseInt(weekParts[2]);

        var program = groupProgram[weekIndex];
        if (student.length >= 3) {
            var weekOverrides = student[2];
            var copied = false;
            for (var i = 0; i < weekOverrides.length; i++) {
                var o = weekOverrides[i];

                var week = o[0];
                if (week !== weekIndex)
                    continue;

                var index = o[1];
                var newColle = o[2];

                if (!copied) {
                    program = program.slice();
                    copied = true;
                }

                if (index === -1) {
                    program.push(newColle);
                } else if (newColle !== -1) {
                    program[index] = newColle;
                } else {
                    program.splice(index, 1);
                }
            }
        }

        var programFormatted = [];

        var isAllDone = true;
        for (var i = 0; i < program.length; i++) {
            var index = program[i];
            var colle = classColles[index];

            var subjectIndex = colle[0];

            var day = colle[2];
            var time = DATA[TIMES][colle[3]];
            var timeParts = time.split(":", 2);
            var hours = parseInt(timeParts[0]);
            var minutes = parseInt(timeParts[1]);
            var startingTime = new Date(weekYear, weekMonth - 1, weekDay + day, hours, minutes).valueOf();

            var state;
            if (now - startingTime >= 1000 * 60 * 60) {
                state = STATE_DONE;
            } else if (startingTime - now <= 1000 * 60 * 60) {
                state = STATE_SOON;
                isAllDone = false;
            } else {
                state = STATE_NORMAL;
                isAllDone = false;
            }

            programFormatted.push({
                subjectIndex: subjectIndex,
                subject: DATA[SUBJECTS][subjectIndex],
                subjectUrl: classSubjectUrls ? classSubjectUrls[subjectIndex] : undefined,
                teacher: DATA[TEACHERS][colle[1]],
                room: colle.length >= 5 ? DATA[ROOMS][colle[4]] : undefined,
                day: day,
                hours: hours,
                minutes: minutes,
                startingTime: startingTime,
                state: state,
            });
        }

        // Do not show weeks that have already ended.
        if (isAllDone)
            continue;

        result.push({
            index: weekIndex,
            year: weekYear,
            month: weekMonth,
            day: weekDay,
            program: programFormatted,
        });
    }

    return result;
}

/**
 * Sends the current document's innerHTML to the Service Worker so that the
 * next time the client sends a request with the viewer page, we send this
 * HTML.
 */
function cacheDocumentHtml() {
    if ("serviceWorker" in navigator) {
        var controller = navigator.serviceWorker.controller;
        if (controller !== null) {
            // Make sure to save the state of the input.
            QUERY.setAttribute("value", QUERY.value);

            controller.postMessage(document.documentElement.innerHTML);
        }
    }
}

/**
 * Performs a search using the value in the student name field and update the
 * UI with the results.
 */
function updateSearch() {
    var studentIndex = performSearch();
    if (studentIndex === -1) {
        INFO_DIV.classList.add("c-js-hide");
        cacheDocumentHtml();
        return;
    }

    // Do not recompute everything if possible.
    if (currStudentIndex === studentIndex) {
        INFO_DIV.classList.remove("c-js-hide");
        cacheDocumentHtml();
        return;
    }

    var student = DATA[STUDENTS][studentIndex];
    var groupIndex = student[0];
    var group = DATA[GROUPS][groupIndex];
    var classIndex = group[0];
    var clazz = DATA[CLASSES][classIndex];

    STUDENT_NAME.textContent = student[1];
    STUDENT_CLASS.textContent = clazz[0];
    GROUP_NR.textContent = group[1];

    var now = new Date().valueOf();
    var program = getColleProgramForStudent(studentIndex, now);

    // Remove all children
    PROGRAM.innerHTML = "";

    // Append new children
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < program.length; i++)
        PROGRAM.appendChild(makeWeekHtml(program[i], now));
    PROGRAM.appendChild(fragment);

    INFO_DIV.classList.remove("c-js-hide");
    INFO_DIV.setAttribute(STUDENT_INDEX_ATTR, studentIndex);
    currStudentIndex = studentIndex;

    cacheDocumentHtml();
}

/**
 * Update relative times on DOM elements on the page.
 */
function updateRelativeTimes() {
    var elements = document.getElementsByClassName("c-relative-time");
    var now = new Date().valueOf();
    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        var timestamp = parseInt(element.getAttribute(TIMESTAMP_ATTR));
        element.textContent = formatRelativeTime(now, timestamp);
    }
}

/**
 * This function is the first function that is called after polyfills have
 * been loaded. All code should be put inside of it, except for function and
 * constant definitions.
 */
function main() {
    // Catch exceptions that are not in a try catch block.
    window.addEventListener("error", function() {
        FORM.classList.add("c-js-hide");
        INFO_DIV.classList.add("c-js-hide");
        ERROR.classList.remove("c-js-hide");
    });

    autoFillQuery();

    var studentIndex = INFO_DIV.getAttribute(STUDENT_INDEX_ATTR);
    if (studentIndex !== null) {
        // Search results have been pre-rendered.
        currStudentIndex = parseInt(studentIndex);
        fetchData().then(function(data) { DATA = data; });
    } else {
        LOADER.classList.remove("c-js-hide");
        fetchData()
            .then(function(data) {
                DATA = data;
                LOADER.classList.add("c-js-hide");
                updateSearch();
            })
            .catch(function(err) {
                console.log("Failed to load data!", err);
                FORM.classList.add("c-js-hide");
                LOADER.classList.add("c-js-hide");
                ERROR.classList.remove("c-js-hide");
            });
    }

    QUERY.addEventListener("input", function() {
        // Remember the name for when the page is opened again.
        if (window.localStorage)
            localStorage.setItem(LOCAL_STORAGE_QUERY, QUERY.value);

        if (DATA)
            updateSearch();
    });
}

/**
 * Loads polyfills for JS features that are required and that the browser does
 * not support.
 * @param {function} cb function that will be called when polyfills are loaded
 */
function loadPolyfills(cb) {
    if (!("trunc" in Math)) {
        Object.defineProperty(Math, "trunc", {
            value: function(v) {
                return v < 0 ? Math.ceil(v) : Math.floor(v);
            },
        });
    }

    if (!("startsWith" in String.prototype)) {
        Object.defineProperty(String.prototype, "startsWith", {
            value: function(search, rawPos) {
                var pos = rawPos > 0 ? rawPos|0 : 0;
                return this.substring(pos, pos + search.length) === search;
            },
        });
    }

    var polyfills = [];
    if (!("Promise" in window))
        polyfills.push("https://cdn.jsdelivr.net/npm/promise-polyfill@8.2.0/dist/polyfill.min.js");
    if (!("fetch" in window))
        polyfills.push("https://cdn.jsdelivr.net/npm/whatwg-fetch@3.5.0/dist/fetch.umd.js");
    if (!("normalize" in String.prototype))
        polyfills.push("https://cdn.jsdelivr.net/npm/unorm@1.6.0/lib/unorm.js");

    var remaining = polyfills.length;
    if (remaining === 0) {
        cb();
        return;
    }

    for (var i = 0; i < remaining; i++) {
        var $script = document.createElement("script");
        $script.src = polyfills[i];
        $script.onload = function(e) {
            remaining--;
            if (remaining === 0)
                cb();
        };
        $script.onerror = function(e) {
            console.error("failed to load polyfill", e);
        };
        document.head.appendChild($script);
    }
}

/**
 * Tries to register the service worker that makes the site available offline.
 */
function tryRegisterServiceWorker() {
    if ("serviceWorker" in navigator) {
        // Immediatly reload the page when the service worker is updated.
        // This is fine since the query is stored in localStorage and therefore
        // after the refresh the page will still show the same information (no
        // user interruption).
        var refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });

        navigator.serviceWorker
            .register("/carnot-colles/sw.js")
            .then(function(sw) {
                // Force check for updates when the page is loaded or when the
                // PWA is brought to foreground. We really don't want to show
                // stale information or else a student might miss a schedule
                // update!
                var lastUpdate = new Date().valueOf();
                sw.update();
                document.addEventListener("visibilitychange", function() {
                    var now = new Date().valueOf();
                    var UPDATE_THROTTLE = 1000 * 60 * 60;
                    if (document.visibilityState === "visible" &&
                        now - lastUpdate >= UPDATE_THROTTLE) {
                        sw.update();
                        lastUpdate = now;
                    }
                });
            });
    }
}

loadPolyfills(main);
tryRegisterServiceWorker();

})();
