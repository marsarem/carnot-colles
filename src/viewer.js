(function() {

"use strict";

var LOCAL_STORAGE_QUERY = "colles-viewer__query";

/**
 * Long living DOM elements
 */

var QUERY = document.getElementById("query");
var LOADER = document.getElementById("loader");
var INFO_DIV = document.getElementById("info");
var STUDENT_NAME = document.getElementById("name");
var STUDENT_CLASS = document.getElementById("class");
var GROUP_NR = document.getElementById("group-nr");
var PROGRAM = document.getElementById("program");

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
 * Fetches the data.json file's content.
 * @returns a promise with the data as an object
 */
function fetchData() {
    return fetch("data.json")
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
    var ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-./:;<=>?@[]^_`{|}";
    var MORE = "~";
    var result = [];
    var n = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str[i];
        if (c === MORE) {
            n += ALPHABET.length;
            continue;
        }
        var index = ALPHABET.indexOf(c);
        if (index === -1)
            throw new Error("invalid string");
        n += index;
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
    if (!window.localStorage)
        return;
    var query = localStorage.getItem(LOCAL_STORAGE_QUERY);
    if (!query)
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
    // not really wanted (it would add more complexity and a dependecy that we
    // have to track versions of).
    var tokens = QUERY.value
        .toLowerCase()
        // Remove accents
        .normalize("NFD") 
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\W+/g)
        // Remove things like "D'"
        .filter(w => w.length >= 2);
    
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
            if (haystack.indexOf(needle) === -1)
                continue;
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

        var indices = new Set();
        for (var i = 0; i < matches.length; i++) {
            var m = searchIndex[matches[i]];
            for (var j = 0; j < m.length; j++)
                indices.add(m[j]);
        }

        return indices;
    }

    function intersection(set1, set2) {
        set1.forEach(function(val) {
            if (!set2.has(val))
                set1.delete(val);
        });
    }

    var candidates = getMatches(tokens[0]);
    for (var i = 1; i < tokens.length && candidates.size; i++) {
        intersection(candidates, getMatches(tokens[i]));
    }

    // IE11 doesn't support Set.prototype.values so we have to iterate the
    // whole set just to get the first value...
    var result = -1;
    candidates.forEach(function(x) {
        if (result === -1)
            result = x;
    });
    return result;
}

/**
 * Relative time formatting
 */

var MINUTE_MS = 1000 * 60;
var HOUR_MS = MINUTE_MS * 60;
var DAY_MS = HOUR_MS * 24;

/**
 * For a given date, returns the amount of seconds from the
 * start of the day of the date.
 * @param date {Date} the date
 * @returns the amount of seconds from the start of the day
 */
function getTimeOfDay(date) {
    return date.getHours() * HOUR_MS +
        date.getMinutes() * MINUTE_MS +
        date.getSeconds();
}

/**
 * Converts a difference between two {@code Date}s into a human
 * readable string in French.
 * @param from {Date} the starting date
 * @param to {Date} the target date
 */
function formatRelativeTime(from, to) {
    var diffMs = to.valueOf() - from.valueOf();
    var diffAbsMs = Math.abs(diffMs);

    function formatHelper(value, label) {
        var result = "";
        result += value > 0 ? "dans " : "il y a ";
        result += Math.abs(value);
        result += " ";
        result += label;
        if (Math.abs(value) > 1)
            result += "s";
        return result;
    }

    if (diffAbsMs < MINUTE_MS) {
        return "maintenant";
    } else if (diffAbsMs < 2 * HOUR_MS) {
        return formatHelper(Math.round(diffMs / MINUTE_MS), "minute");
    } else {
        // First take the difference in actual days between the two
        // time points.
        var diffDays = Math.trunc(diffMs / DAY_MS);
        // Then increment the count if midnight has passed between
        // from + diffDays * DAY_MS and to. In French, when we talk
        // a difference in days, we are actually talking about the
        // count of midnights between the two times. This code will
        // correct for this.
        var timeOfDayFrom = getTimeOfDay(from);
        var timeOfDayTo = getTimeOfDay(to);
        if (diffMs > 0 && timeOfDayTo < timeOfDayFrom) {
            diffDays++;
        } else if (diffMs < 0 && timeOfDayFrom < timeOfDayTo) {
            diffDays--;
        }
        if (diffDays === 0) {
            return formatHelper(Math.round(diffMs / HOUR_MS), "heure");
        } else if (diffDays === -2) {
            return "avant-hier";
        } else if (diffDays === -1) {
            return "hier";
        } else if (diffDays === 1) {
            return "demain";
        } else if (diffDays === 2) {
            return "après-demain";
        }
        return formatHelper(diffDays, "jour");
    }
}

/**
 * Makes a colle DOM element.
 * @param {object} colle the colle
 * @returns the DOM element
 */
function makeColleHtml(colle) {
    var $colle = document.createElement("li");
    $colle.classList.add("colle");
    $colle.classList.add("colle--" + colle.state);
    $colle.classList.add("colle--subject-" + (colle.subjectIndex % 4));

    var $subject = document.createElement("p");
    $subject.classList.add("colle__subject");

    if (colle.subjectUrl !== undefined) {
        var $link = document.createElement("a");
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

    var $info = document.createElement("p");
    $info.classList.add("colle__info");
    $info.appendChild(document.createTextNode(colle.teacher));

    if (colle.room !== undefined) {
        $info.appendChild(document.createElement("br"));
        $info.appendChild(document.createTextNode("Salle " + colle.room));
    }

    $info.appendChild(document.createElement("br"));
    $info.appendChild(document.createTextNode(day + " à " +
        colle.time.replace(":", "h") + " (" +
        formatRelativeTime(new Date(), colle.dateTime) + ")"));
    $colle.appendChild($info);

    return $colle;
}

/**
 * Makes a week DOM element.
 * @param {object} week the week information
 * @returns the DOM element
 */
function makeWeekHtml(week) {
    var $week = document.createElement("section");
    $week.classList.add("week");

    var $weekTitle = document.createElement("h1");
    $weekTitle.classList.add("week__title");
    $weekTitle.textContent = "Semaine " + (week.index + 1) + " (" + week.day + "/" + week.month + ")";
    $week.appendChild($weekTitle);

    var $colles = document.createElement("ul");
    $colles.classList.add("week__colles");
    for (var i = 0; i < week.colles.length; i++)
        $colles.appendChild(makeColleHtml(week.colles[i]));
    $week.appendChild($colles);

    return $week;
}

/**
 * Performs a search using the value in the student name field and update the
 * UI with the results.
 */
function updateSearch() {
    var studentIndex = performSearch();
    if (studentIndex === -1) {
        INFO_DIV.classList.add("js-hide");
        return;
    }
    
    var student = DATA[STUDENTS][studentIndex];

    STUDENT_NAME.innerText = student[1];

    var groupIndex = student[0];
    var group = DATA[GROUPS][groupIndex];

    GROUP_NR.innerText = group[1];

    var classIndex = group[0];
    var clazz = DATA[CLASSES][classIndex];
    var classWeeks = decodeIntegerArray(clazz[2]);
    var classColles = decodeArrayOfIntegerArrays(clazz[1]);
    var classSubjectUrls = clazz[3];

    STUDENT_CLASS.innerText = clazz[0];

    var result = [];

    var now = new Date();

    var groupProgram = decodeArrayOfIntegerArrays(group[2]);
    for (var weekIndex = 0; weekIndex < groupProgram.length; weekIndex++) {
        var week = DATA[WEEKS][classWeeks[weekIndex]];
        var weekParts = week.split("-", 3);
        var year = parseInt(weekParts[0]);
        var month = parseInt(weekParts[1]);
        var day = parseInt(weekParts[2]);
        result.push({
            index: weekIndex,
            year,
            month,
            day,
            colles: groupProgram[weekIndex].map(function(index) {
                var colle = classColles[index];
                var out = {
                    subjectIndex: colle[0],
                    subjectUrl: classSubjectUrls[colle[0]],
                    subject: DATA[SUBJECTS][colle[0]],
                    teacher: DATA[TEACHERS][colle[1]],
                    day: colle[2],
                    time: DATA[TIMES][colle[3]],
                };
                var timeParts = out.time.split(":", 2);
                var hour = timeParts[0];
                var minutes = timeParts[1];
                out.dateTime = new Date(year, month - 1, day + out.day, hour, minutes);
                if (now.valueOf() - out.dateTime.valueOf() > 1000 * 60 * 60) {
                    out.state = "done";
                } else if (out.dateTime.valueOf() - now.valueOf() <= 1000 * 60 * 60) {
                    out.state = "soon";
                } else {
                    out.state = "normal";
                }
                if (colle.length > 4)
                    out.room = DATA[ROOMS][colle[4]];
                return out;
            }),
        });
    }

    // Remove weeks where all colles are already done.
    result = result.filter(function(week) {
        return week.colles
            .some(function(colle) {
                return colle.state !== "done";
            });
    });

    while (PROGRAM.firstChild)
        PROGRAM.removeChild(PROGRAM.firstChild);
    for (var i = 0; i < result.length; i++)
        PROGRAM.appendChild(makeWeekHtml(result[i]));

    INFO_DIV.classList.remove("js-hide");
}

/**
 * This function is the first function that is called after polyfills have
 * been loaded. All code should be put inside of it, except for function and
 * constant definitions.
 */
function main() {
    autoFillQuery();
    LOADER.classList.remove("js-hide");
    fetchData()
        .then(function(data) {
            DATA = data;
            LOADER.classList.add("js-hide");
            updateSearch();
        })
        .catch(function(err) {
            console.log("failed to load data", err);
        });
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
    if (!Math.trunc) {
        Math.trunc = function(v) {
            return v < 0 ? Math.ceil(v) : Math.floor(v);
        };
    }

    var polyfills = [];
    if (!window.Promise)
        polyfills.push("https://cdn.jsdelivr.net/npm/promise-polyfill@8.2.0/dist/polyfill.min.js");
    if (!window.fetch)
        polyfills.push("https://cdn.jsdelivr.net/npm/whatwg-fetch@3.5.0/dist/fetch.umd.js");
    if (!String.prototype.normalize)
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
        navigator.serviceWorker
            .register("/carnot-colles/sw.js")
            .then(function() {
                console.log("successfully registered service worker");
            });
    }
}

loadPolyfills(main);
tryRegisterServiceWorker();

})();
