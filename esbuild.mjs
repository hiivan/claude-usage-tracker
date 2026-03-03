import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const extensionCtx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  bundle: true,
  sourcemap: true,
});

const webviewCtx = await esbuild.context({
  entryPoints: ['webview/App.tsx'],
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  bundle: true,
  sourcemap: true,
});

if (watch) {
  await extensionCtx.watch();
  await webviewCtx.watch();
  console.log('Watching for changes...');
} else {
  await extensionCtx.rebuild();
  await extensionCtx.dispose();
  await webviewCtx.rebuild();
  await webviewCtx.dispose();
  console.log('Build complete.');
}
