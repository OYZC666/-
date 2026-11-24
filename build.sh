#!/bin/sh
set -eu

mkdir -p dist
cp server.js run.sh dist/
mkdir -p dist/public
cp -R public/. dist/public/
chmod 755 dist/run.sh
