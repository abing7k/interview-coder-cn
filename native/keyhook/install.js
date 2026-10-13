// Build the native addon on macOS. On other platforms there is nothing to
// compile: index.js degrades to a no-op wrapper.
const { execSync } = require('child_process')

if (process.platform !== 'darwin') {
  console.log('[keyhook] 非 macOS 平台，跳过原生模块编译')
  process.exit(0)
}

try {
  execSync('node-gyp rebuild', { stdio: 'inherit', cwd: __dirname })
} catch (err) {
  // A missing toolchain must not break the whole npm install: the wrapper
  // reports `available: false` and the app falls back to globalShortcut
  console.warn('[keyhook] 原生模块编译失败，吞键功能不可用，其余功能不受影响:', err.message)
  process.exit(0)
}
