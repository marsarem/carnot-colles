"use strict";

const fs = require("fs");
const path = require("path");

function arrayEquals(a, b) {
    return a.length === b.length &&
        a.every((val, index) => val === b[index]);
}

function describeDifference(got, expected) {
    got = got.split("\n");
    expected = expected.split("\n");

    if (got.length < expected.length) {
        return "missing lines";
    } else if (got.length > expected.length) {
        return "too many lines";
    }

    for (let i = 0; i < got.length; i++) {
        if (got[i] !== expected[i])
            return "different text at line " + (i + 1);
    }

    return null;
}

function isNonEmptyStringArray(val) {
    return Array.isArray(val) &&
        val.every(x => typeof x === "string" && x.trim() !== "")
}

function isValidWeek(str) {
    const parts = str.split("-", 2);
    if (parts.length !== 2)
        return false;
    if (parts.some(p => parseInt(p).toString() !== p || !Number.isInteger(parseInt(p))))
        return false;
    if (parts[0] < 1 || parts[0] > 12 ||
        parts[1] < 1 || parts[0] > 31)
        return false;
    return true;
}

function validateData(json) {
    if (process.env.VALIDATE_LF !== "1") {
        // Convert CRLF to LF because it will be converted by Git anyways.
        json = json.replace(/\r\n/g, "\n");
    }

    const data = JSON.parse(json);
    
    const formattedJson = JSON.stringify(data, null, "    ");
    if (json !== formattedJson)
        throw new Error("bad formatting: " +
            describeDifference(json, formattedJson));

    if (data === null || typeof data !== "object")
        throw new Error("invalid type at root");

    if (!isNonEmptyStringArray(data.credits))
        throw new Error("invalid credits");
    
    if (!Array.isArray(data.groups) ||
        data.groups.some(g => !isNonEmptyStringArray(g)))
        throw new Error("invalid groups");
    
    if (typeof data.firstGroup !== "number" || !Number.isInteger(data.firstGroup))
        throw new Error("invalid first group number");

    if (!isNonEmptyStringArray(data.subjects))
        throw new Error("invalid subjects");

    if (!isNonEmptyStringArray(data.teachers))
        throw new Error("invalid teachers");
    
    function isValidColleType(val) {
        if (val === null || typeof val !== "object")
            return false;
        if (typeof val.subject !== "number" ||
            typeof val.teacher !== "number" ||
            typeof val.day !== "number" ||
            typeof val.room !== "string" ||
            typeof val.time !== "number")
            return false;
        if (!Number.isInteger(val.subject) || val.subject < 0 ||
            val.subject >= data.subjects.length)
            return false;
        if (val.room === "" || val.room.trim() !== val.room ||
            (val.room.indexOf("0") === 0 && val !== "0"))
            return false;
        if (!Number.isInteger(val.time) || val.time < 0 || val.time >= 24)
            return false;
        return true;
    }

    if (!Array.isArray(data.types))
        throw new Error("invalid colle types");
    for (let i = 0; i < data.types.length; i++) {
        if (!isValidColleType(data.types[i]))
            throw new Error(`invalid colle type ${i}`);
        if (!arrayEquals(Object.keys(data.types[i]),
            ["subject", "teacher", "day", "room", "time"]))
            throw new Error(`invalid key order for colle type ${i}`);
    }

    if (!isNonEmptyStringArray(data.weeks) ||
        data.weeks.some(w => !isValidWeek(w)))
        throw new Error("invalid weeks");
    
    let lastDate = null;
    for (let i = 0; i < data.weeks.length; i++) {
        const parts = data.weeks[i].split("-").map(x => parseInt(x));
        const month = parts[0];
        const year = month < 9 ? 2021 : 2020;
        const date = new Date(year, month, parts[1]);
        if (lastDate !== null && date.valueOf() <= lastDate.valueOf())
            throw new Error("weeks are not sorted chronologically");
        lastDate = date;
    }
    
    function isValidColle(val) {
        if (val === null || typeof val !== "object")
            return false;
        if (typeof val.week !== "number" ||
            typeof val.type !== "number")
            return false;
        if (!Number.isInteger(val.week) || val.week < 0 ||
            val.week >= data.weeks.length)
            return false;
        if (!Number.isInteger(val.type) || val.type < 0 ||
            val.type >= data.types.length)
            return false;
        return true;
    }

    if (!Array.isArray(data.colles))
        throw new Error("invalid colles");
    if (data.colles.length !== data.groups.length)
        throw new Error("length of groups array doesn't match length of colles array");
    for (let groupIndex = 0; groupIndex < data.colles.length; groupIndex++) {
        const groupColles = data.colles[groupIndex];

        let lastWeek = null;
        const typesByWeek = new Map();
        for (let i = 0; i < groupColles.length; i++) {
            const colle = groupColles[i];
            if (!isValidColle(colle))
                throw new Error(`invalid colle ${i} for group ${groupIndex}`);
            if (!arrayEquals(Object.keys(colle), ["week", "type"]))
                throw new Error(`invalid key order in colle ${i} for group ${groupIndex}`);

            if (!typesByWeek.has(colle.week)) {
                typesByWeek.set(colle.week, []);
            } else if (typesByWeek.get(colle.week).includes(colle.type)) {
                throw new Error(`duplicate colle ${i} for group ${groupIndex}`);
            }
            typesByWeek.get(colle.week)
                .push(colle.type);

            if (lastWeek !== null && colle.week < lastWeek)
                throw new Error(`colles for group ${groupIndex} are not sorted by week ascending`);
            lastWeek = colle.week;
        }
    }

    if (!arrayEquals(Object.keys(data), ["credits", "groups", "firstGroup", "subjects", "teachers", "types", "weeks", "colles"]))
        throw new Error("invalid key order at root");
}

async function main() {
    const filenames = await fs.promises.readdir("data");
    const contents = await Promise.all(filenames
        .map(f => {
            const p = path.join("data", f);
            return fs.promises.readFile(p, "utf-8");
        }));

    for (let i = 0; i < contents.length; i++) {
        try {
            validateData(contents[i]);
        } catch (err) {
            console.error(`data validation failed for ${filenames[i]}`, err);
            process.exitCode = 1;
        }
    }
}

main();
