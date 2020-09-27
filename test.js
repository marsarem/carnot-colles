"use strict";

const fs = require("fs");
const path = require("path");

async function main() {
    const filenames = await fs.promises.readdir("data");
    const contents = await Promise.all(filenames
        .map(f => {
            const p = path.join("data", f);
            return fs.promises.readFile(p, "utf-8");
        }));
    const data = JSON.parse(contents[2]);
    console.log(data);
    console.log(JSON.stringify(data, null, "    "));
}

main();