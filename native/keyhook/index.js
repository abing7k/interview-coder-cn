// Loads the native addon when present; degrades to a no-op wrapper otherwise
// (non-macOS platforms, or a failed native build).
let addon = null
try {
  addon = require('./build/Release/keyhook.node')
} catch (err) {
  addon = null
}

module.exports = {
  available: !!addon,
  start(combos, callback) {
    if (!addon) return false
    addon.start(combos, (index) => {
      try {
        callback(index)
      } catch (err) {
        console.error('[keyhook] callback error:', err)
      }
    })
    return true
  },
  stop() {
    if (addon) addon.stop()
  },
  isRunning() {
    return !!(addon && addon.isRunning())
  }
}
