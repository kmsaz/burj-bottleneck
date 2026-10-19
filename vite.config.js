import { defineConfig } from 'vite';

// The app is published as a GitHub project page at
// https://kmsaz.github.io/burj-bottleneck/, so production builds must resolve
// assets from that subpath. The dev server keeps serving from "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/burj-bottleneck/' : '/',
}));
