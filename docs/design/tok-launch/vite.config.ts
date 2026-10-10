import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({base: './', resolve: {dedupe: ['react','react-dom']}, server: {fs: {allow: [resolve(__dirname, '../../..')]}}, css: {postcss: {plugins: []}}});
