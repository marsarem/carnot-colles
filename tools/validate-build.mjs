#!/usr/bin/node

"use-strict";

import * as fs from "fs/promises";
import * as childProcess from "child_process";

import * as dirCompare from "dir-compare";

async function main() {
    // Make sure that the dist directory actually exists.
    try {
        fs.stat("dist");
    } catch (err) {
        throw new Error("Failed to stat dist directory!", err);
    }

    // Build on a separate directory.
    const tmp = await fs.mkdtemp("validate-build");
    try {
        const code = await new Promise((resolve, reject) => {
            const child = childProcess.fork("tools/build.mjs", [tmp]);
            child.on("error", reject);
            child.on("exit", resolve);
        });
        if (code != 0)
            throw new Error("The build script failed!");

        // Compare directories.
        const cmp = await dirCompare.compare("dist", tmp, { compareContent: true });
        if (!cmp.same) {
            throw new Error("New build is not the same as committed build! Diff set: " +
                JSON.stringify(cmp.diffSet.filter(d => d.state !== "equal")));
        }
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
