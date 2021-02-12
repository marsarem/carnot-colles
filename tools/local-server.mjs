#!/usr/bin/node

"use strict";

import childProcess from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

import chokidar from "chokidar";
import nodeStatic from "node-static";

const scriptLocation = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptLocation);

class Builder {
    _isBuilding = false;
    _isBuildPending = false;

    scheduleBuild() {
        if (this._isBuilding) {
            this._isBuildPending = true;
            return;
        }
        this._startBuild();
    }

    _build() {
        return new Promise((resolve, reject) => {
            console.log("Starting build...");
    
            let cbInvoked = false;
    
            const buildScript = path.join(scriptLocation, "build.mjs");
            const process = childProcess.fork(buildScript);
    
            process.on("error", err => {
                if (cbInvoked) return;
                reject(err);
                cbInvoked = true;
            });
    
            process.on("exit", exitCode => {
                if (cbInvoked) return;
                if (exitCode === 0) {
                    resolve();
                } else {
                    reject(new Error(`non-zero exit code: ${exitCode}`));
                }
                cbInvoked = true;
            });
        });
    }

    _startBuild() {
        this._build()
            .then(() => {
                console.log("Build succeeded!");
                this._onBuildFinish();
            })
            .catch(err => {
                console.error(`Failed to build: ${err}`);
                this._onBuildFinish();
            });
        this._isBuilding = true;
    }

    _onBuildFinish() {
        if (this._isBuildPending) {
            this._startBuild();
            this._isBuildPending = false;
        } else {
            this._isBuilding = false;
        }
    }
}

class HttpServer {
    constructor() {
        const distDir = path.join(root, "dist");
        this._files = new nodeStatic.Server(distDir);
        this._http = http.createServer(this._onRequest.bind(this));
    }

    listen() {
        this._http.listen(8000);
        console.log("Listening on port 8000...");
        console.log("URL: http://localhost:8000/carnot-colles/");
    }

    _onRequest(req, res) {
        const PREFIX = "/carnot-colles";
        if (!req.url.startsWith(PREFIX)) {
            res.writeHead(404);
            res.end("Bad URL!");
            return;
        }
        const fakeReq = Object.create(req);
        fakeReq.url = req.url.substring(PREFIX.length);
        this._files.serve(fakeReq, res);
    }
}

function main() {
    const builder = new Builder();
    // Initial build.
    builder.scheduleBuild();

    const watcher = chokidar.watch([
        path.join(root, "src"),
        path.join(root, "data"),
    ]);
    let buildTimerHandle = null;
    watcher.on("change", () => {
        if (buildTimerHandle !== null)
            clearTimeout(buildTimerHandle);
        buildTimerHandle = setTimeout(() => builder.scheduleBuild(), 300);
    });

    const server = new HttpServer();
    server.listen();
}

main();
