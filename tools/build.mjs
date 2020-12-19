#!/usr/bin/node

"use strict";

import * as fs from "fs/promises";
import * as path from "path";

import csso from "csso";
import Handlebars from "handlebars";
import { minify } from "html-minifier";
import svg2png from "svg2png";
import toIco from "to-ico";
import UglifyJS from "uglify-js";

const SRC_DIR = "src";
const DATA_DIR = "data";
const DIST_DIR = process.argv[2] ?? "dist";

const UGLIFY_JS_OPTS = {
    compress: {
        unsafe: true,
        unsafe_math: true,
    },
    mangle: {
        toplevel: true,
    },
};

/**
 * Reads the data files for each class and returns the parsed JSON.
 * @returns an array with promises that resolve to data and ID for each class
 */
async function readClasses() {
    const files = await fs.readdir(DATA_DIR);
    return files
        .filter(f => f.endsWith(".json"))
        .map(async f => {
            const id = f.substring(0, f.length - ".json".length);
            const content = await fs.readFile(path.join(DATA_DIR, f), { encoding: "utf8" });
            return { id, data: JSON.parse(content) };
        });
}

/**
 * Initially, the class data contains a lot of "pointers". For instance, the
 * colles point to a week and to a colle type, which itself points to a
 * teacher, etc.
 * This function takes a class data object and a group index and returns
 * the weeks with the colles for that group, in a format that's more usable,
 * without pointers to the class data object.
 * @param classData the class data from the JSON file
 * @param groupIndex the index of the group
 * @returns the weeks with the colles with the fields
 */
function getWeeksForGroup(classData, groupIndex) {
    return classData.groups[groupIndex].weeks
        .map((w, i) => {
            const [year, month, day] = classData.weeks[i]
                .split("-", 3)
                .map(s => parseInt(s));
            return {
                year,
                month,
                day,
                colles: w.map(j => {
                    const c = classData.colles[j];
                    return {
                        ...c,
                        subject: classData.subjects[c.subject],
                        teacher: classData.teachers[c.teacher],
                    };
                }),
            };
        });
}

/**
 * Deletes previous contents from the dist directory and recreates the correct
 * directory structure in order for the rest of the script to be able to put
 * files in directories in the dist directory.
 */
async function prepareDistDirectory() {
    // Make sure that the dist directory exists.
    await fs.rm(DIST_DIR, { recursive: true, force: true });
    await fs.mkdir(DIST_DIR);

    // Create directories before putting the files in them.
    await Promise.all([
        fs.mkdir(path.join(DIST_DIR, "data")),
        fs.mkdir(path.join(DIST_DIR, "light")),
    ]);
}

/**
 * Minifies HTML code.
 * @param html the original HTML code 
 * @returns the minifed HTML code
 */
function minifyHtml(html) {
    return minify(html, {
        caseSensitive: false,
        collapseInlineTagWhitespace: false,
        collapseWhitespace: true,
        html5: true,
        removeOptionalTags: true,
        minifyCSS: false,
        minifyJS: false,
    });
}

/**
 * Generates very lightweight and simple HTML code with all of the information
 * needed for a particular group of a particular class.
 * @param classData the class' data
 * @param groupIndex the index of the group
 * @returns HTML code that has information about colles for that group
 */
function lightweightGroupPageHtml(classData, groupIndex) {
    const humanGroupNumber = groupIndex + classData.firstGroup;

    function colleHtml(c) {
        const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
        return `<li>
            <strong>${c.subject}</strong><br>
            ${c.teacher}<br>
            Salle ${c.room}<br>
            ${DAYS[c.day]} à ${c.time}h
        </li>`;
    }

    function weekHtml(w) {
        return `<h2>Semaine ${w.day}/${w.month}/${w.year}</h2>
            <ul>
                ${w.colles.map(colleHtml).join("")}
            </ul>`;
    }

    const studentsHtml = `<h2>Membres du groupe</h2>
        <ul>
            ${classData.groups[groupIndex].students.map(s => `<li>${s}</li>`).join("")}
        </ul>`;

    const weeks = getWeeksForGroup(classData, groupIndex);
    const weeksHtml = weeks.map(weekHtml).join("");

    const creditsHtml = `<p>
            Personne(s) ayant participé à l'importation et la correction des
            données :
        </p>
        <ul>
            ${classData.credits.map(c => `<li>${c}</li>`).join("")}
        </ul>`;

    const title = `Colloscope ${classData.name}, groupe ${humanGroupNumber}`;
    return minifyHtml(`<!doctype html>
<html lang="fr">
    <head>
        <meta http-equiv="content-type" content="text/html;charset=utf-8">
        <title>${title}</title>
    </head>
    <body>
        <h1>${title}</h1>
        ${studentsHtml}
        ${weeksHtml}
        ${creditsHtml}
    </body>
</html>`);
}

/**
 * Generates HTML code for the lightweight index page, with links to the
 * specific groups and classes.
 * @param {Array} links an array of objects that represent links to a page with
 *                      colles for a group
 * @returns HTML code that has information about colles for that group
 */
function lightweightIndexPageHtml(classes) {
    function groupHtml(g) {
        return `<li><a href="${g.url}">Groupe ${g.groupNr}</a></li>`;
    }

    function classHtml(c) {
        return `<h2>${c.className}</h2>
<ul>${c.groups.map(groupHtml).join("")}</ul>`;
    }

    const classesHtml = classes.map(classHtml).join("");
    return minifyHtml(`<!doctype html>
<html lang="fr">
    <head>
        <meta http-equiv="content-type" content="text/html;charset=utf-8">
        <title>Liste des colloscopes</title>
    </head>
    <body>
        <h1>Liste des colloscopes</h1>
        ${classesHtml}
    </body>
</html>`);
}

function buildStaticContent() {
    return Promise.all([
        fs.copyFile(path.join(SRC_DIR, "robots.txt"), path.join(DIST_DIR, "robots.txt")),

        Promise.all([
            fs.readFile(path.join(SRC_DIR, "viewer.html"), "utf8"),
            fs.readFile(path.join(SRC_DIR, "viewer.css"), "utf8"),
            fs.readFile(path.join(SRC_DIR, "viewer.js"), "utf8"),
        ]).then(arr => {
            const [html, css, js] = arr;
            const template = Handlebars.compile(html, { noEscape: true });
            const minified = minifyHtml(template({
                css: csso.minify(css).css,
                js: UglifyJS.minify(js, UGLIFY_JS_OPTS).code,
            }));
            return fs.writeFile(path.join(DIST_DIR, "index.html"), minified, "utf8");
        }),

        fs.readFile(path.join(SRC_DIR, "sw.js"), "utf8")
            .then(js => fs.writeFile(path.join(DIST_DIR, "sw.js"), UglifyJS.minify(js, UGLIFY_JS_OPTS).code, "utf8")),

        fs.readFile(path.join(SRC_DIR, "icon.svg"))
            .then(buf => {
                const faviconPromises = [];
                for (const size of [16, 32, 48])
                    faviconPromises.push(svg2png(buf, { width: size, height: size }));

                const pngIconsPromises = [];
                for (const size of [16, 32, 192, 512])
                    pngIconsPromises.push(svg2png(buf, { width: size, height: size })
                        .then(buf => fs.writeFile(path.join(DIST_DIR, `icon-${size}.png`), buf)));

                return Promise.all([
                    Promise.all(faviconPromises)
                        .then(bufs => toIco(bufs))
                        .then(buf => fs.writeFile(path.join(DIST_DIR, "favicon.ico"), buf)),

                    svg2png(buf, { width: 180, height: 180 })
                        .then(buf => fs.writeFile(path.join(DIST_DIR, "apple-touch-icon.png"), buf)),

                    ...pngIconsPromises,
                ]);
            }),

        fs.readFile(path.join(SRC_DIR, "manifest.webmanifest"), "utf8")
            .then(json => fs.writeFile(path.join(DIST_DIR, "manifest.webmanifest"), JSON.stringify(JSON.parse(json)), "utf8")),
    ]);
}

async function buildDynamicContent(classes) {
    // Keep track of what we write so that we can generate an index.html page
    // for browsers without JavaScript later.
    const writtenClasses = [];

    await Promise.all(classes.map(async promise => {
        const { id, data } = await promise;

        const writtenGroups = [];
        writtenClasses.push({ className: data.name, groups: writtenGroups });

        return Promise.all([
            // A minified version of the data.
            fs.writeFile(path.join(DIST_DIR, "data", id + ".json"), JSON.stringify(data), "utf8"),

            // Make a lightweight version for each group for extremely old
            // browsers or for interoperability with arcane platforms.
            fs.mkdir(path.join(DIST_DIR, "light", id))
                .then(() => {
                    const writes = [];
                    for (let i = 0; i < data.groups.length; i++) {
                        const groupNr = i + data.firstGroup;
                        const file = `groupe-${groupNr}.html`;

                        const html = lightweightGroupPageHtml(data, i);
                        const dest = path.join(DIST_DIR, "light", id, file);
                        writes.push(fs.writeFile(dest, html, "utf8"));

                        writtenGroups.push({ groupNr, url: `${id}/${file}` });
                    }
                    return Promise.all(writes);
                }),
        ]);
    }));
    await fs.writeFile(path.join(DIST_DIR, "light", "index.html"),
        lightweightIndexPageHtml(writtenClasses), "utf8");
}

async function main() {
    await prepareDistDirectory();
    return Promise.all([
        buildStaticContent(),
        buildDynamicContent(await readClasses()),
    ]);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
