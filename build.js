const esbuild = require("esbuild");

esbuild.buildSync({
  entryPoints: ["src/source.ts"],
  bundle: true,
  outfile: "dist/script.js",
  format: "iife",       // wraps in an IIFE, fine since we assign to globalThis explicitly
  target: "es2019",       // match the JS engine Grayjay embeds — no bleeding-edge syntax
  platform: "browser",
  minify: false,           // keep readable while developing; enable for release
});