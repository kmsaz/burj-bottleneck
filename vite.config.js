import { defineConfig } from 'vite';
import { copyFileSync, createReadStream, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

// Pyodide is loaded at runtime from /pyodide/, never bundled. These are the
// files the Python runtime fetches on demand; everything else in the package
// (docs, source maps) stays out of the build.
const PYODIDE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const PYODIDE_SRC = resolve('node_modules/pyodide');
const CONTENT_TYPES = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
};

/** Serve the Python runtime in dev and copy it into dist/ on build. */
function pyodideAssets() {
  return {
    name: 'pyodide-assets',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (!path.startsWith('/pyodide/')) return next();

        const name = path.slice('/pyodide/'.length);
        if (!PYODIDE_FILES.includes(name)) return next();

        res.setHeader('Content-Type', CONTENT_TYPES[extname(name)] ?? 'application/octet-stream');
        createReadStream(join(PYODIDE_SRC, name))
          .on('error', next)
          .pipe(res);
      });
    },

    closeBundle() {
      const out = resolve('dist/pyodide');
      mkdirSync(out, { recursive: true });
      for (const file of PYODIDE_FILES) {
        copyFileSync(join(PYODIDE_SRC, file), join(out, file));
      }
    },
  };
}

// The app is published as a GitHub project page at
// https://kmsaz.github.io/burj-bottleneck/, so production builds must resolve
// assets from that subpath. The dev server keeps serving from "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/burj-bottleneck/' : '/',
  plugins: [pyodideAssets()],
}));
