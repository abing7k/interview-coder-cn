// macOS-only native addon: a CGEventTap that swallows registered hotkey combos
// at the system level, so the focused app (browser, exam page) never sees them.
// Every other key event passes through untouched.
//
// The tap runs on a dedicated thread's run loop; matches are reported to JS
// through a thread-safe function created once and kept for the app's lifetime
// (releasing it on stop could race with a queued trigger).

#include <napi.h>
#include <ApplicationServices/ApplicationServices.h>

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

namespace {

struct Combo {
  CGKeyCode keyCode;
  bool alt;
  bool shift;
  bool cmd;
  bool ctrl;
  bool pendingUp = false;
};

std::vector<Combo> g_combos;
Napi::ThreadSafeFunction g_tsfn;
bool g_tsfnReady = false;

CFMachPortRef g_tap = nullptr;
CFRunLoopSourceRef g_source = nullptr;
CFRunLoopRef g_runLoop = nullptr;
std::thread g_thread;
std::mutex g_mutex;
std::condition_variable g_cv;
std::atomic<bool> g_running{false};
std::atomic<bool> g_threadReady{false};

// Modifier state tracked from the key events themselves: keyboard drivers
// (Karabiner etc.) re-post events without their modifier flags, so the
// event's own flags cannot be trusted on their own
bool g_cmdDown = false;
bool g_altDown = false;
bool g_ctrlDown = false;
bool g_shiftDown = false;

void updateModifiers(CGKeyCode key, bool down) {
  switch (key) {
    case 54:  // kVK_RightCommand
    case 55:  // kVK_Command
      g_cmdDown = down;
      break;
    case 56:  // kVK_Shift
    case 60:  // kVK_RightShift
      g_shiftDown = down;
      break;
    case 58:  // kVK_Option
    case 61:  // kVK_RightOption
      g_altDown = down;
      break;
    case 59:  // kVK_Control
    case 62:  // kVK_RightControl
      g_ctrlDown = down;
      break;
    default:
      break;
  }
}

bool matchComboByFlags(const Combo& combo, CGKeyCode key, CGEventFlags flags) {
  if (key != combo.keyCode) return false;
  return (!!(flags & kCGEventFlagMaskAlternate) == combo.alt) &&
         (!!(flags & kCGEventFlagMaskShift) == combo.shift) &&
         (!!(flags & kCGEventFlagMaskCommand) == combo.cmd) &&
         (!!(flags & kCGEventFlagMaskControl) == combo.ctrl);
}

bool matchComboTracked(const Combo& combo, CGKeyCode key) {
  if (key != combo.keyCode) return false;
  return g_altDown == combo.alt && g_shiftDown == combo.shift && g_cmdDown == combo.cmd &&
         g_ctrlDown == combo.ctrl;
}

// Last resort: the session's live modifier state. Correct even when the
// modifier keydowns never reached this tap (tap started mid-hold, or the
// driver's re-posted event lost its flags and our tracked state never saw it)
bool matchComboGlobal(const Combo& combo, CGKeyCode key) {
  if (key != combo.keyCode) return false;
  CGEventFlags fl = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
  return (!!(fl & kCGEventFlagMaskAlternate) == combo.alt) &&
         (!!(fl & kCGEventFlagMaskShift) == combo.shift) &&
         (!!(fl & kCGEventFlagMaskCommand) == combo.cmd) &&
         (!!(fl & kCGEventFlagMaskControl) == combo.ctrl);
}

CGEventRef onEvent(CGEventTapProxy, CGEventType type, CGEventRef event, void*) {
  if (type != kCGEventKeyDown && type != kCGEventKeyUp) return event;

  CGKeyCode key = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  CGEventFlags flags = CGEventGetFlags(event);

  if (type == kCGEventKeyDown) {
    updateModifiers(key, true);
    for (size_t i = 0; i < g_combos.size(); i++) {
      // Any matching path suffices: the event's own flags, the modifiers
      // tracked from the event stream, or the session's live modifier state
      if (matchComboByFlags(g_combos[i], key, flags) || matchComboTracked(g_combos[i], key) ||
          matchComboGlobal(g_combos[i], key)) {
        bool repeat = CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat) != 0;
        g_combos[i].pendingUp = true;
        if (!repeat && g_tsfnReady) {
          size_t index = i;
          g_tsfn.NonBlockingCall([index](Napi::Env env, Napi::Function fn) {
            fn.Call({Napi::Number::New(env, static_cast<double>(index))});
          });
        }
        return nullptr;  // swallow the keydown
      }
    }
  } else {
    updateModifiers(key, false);
    // The keyup may arrive with its modifiers already released, so swallow it
    // based on the pending state captured when the matching keydown was eaten
    for (auto& combo : g_combos) {
      if (combo.pendingUp && key == combo.keyCode) {
        combo.pendingUp = false;
        return nullptr;
      }
    }
  }
  return event;
}

void stopInternal() {
  if (!g_running.exchange(false)) return;

  if (g_thread.joinable()) {
    std::unique_lock<std::mutex> lock(g_mutex);
    g_cv.wait(lock, [] { return g_threadReady.load(); });
    lock.unlock();
    if (g_runLoop) CFRunLoopStop(g_runLoop);
    g_thread.join();
  }

  if (g_source) {
    CFRunLoopSourceInvalidate(g_source);
    CFRelease(g_source);
    g_source = nullptr;
  }
  if (g_tap) {
    CGEventTapEnable(g_tap, false);
    CFMachPortInvalidate(g_tap);
    CFRelease(g_tap);
    g_tap = nullptr;
  }
  g_runLoop = nullptr;
  g_threadReady = false;
  g_combos.clear();
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_running.load()) stopInternal();

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "start(combos, callback)").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  Napi::Array arr = info[0].As<Napi::Array>();
  std::vector<Combo> combos;
  for (uint32_t i = 0; i < arr.Length(); i++) {
    Napi::Value item = arr.Get(i);
    if (!item.IsObject()) continue;
    Napi::Object obj = item.As<Napi::Object>();
    int keyCode = obj.Get("keyCode").As<Napi::Number>().Int32Value();
    if (keyCode < 0 || keyCode > 127) continue;
    Combo combo;
    combo.keyCode = static_cast<CGKeyCode>(keyCode);
    combo.alt = obj.Get("alt").As<Napi::Boolean>().Value();
    combo.shift = obj.Get("shift").As<Napi::Boolean>().Value();
    combo.cmd = obj.Get("cmd").As<Napi::Boolean>().Value();
    combo.ctrl = obj.Get("ctrl").As<Napi::Boolean>().Value();
    combos.push_back(combo);
  }
  if (combos.empty()) return Napi::Boolean::New(env, false);

  // Create the tap on this (main) thread so a missing accessibility grant is
  // reported synchronously: without it the tap exists but delivers no events
  g_tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault,
                           CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp),
                           onEvent, nullptr);
  if (!g_tap || !CGEventTapIsEnabled(g_tap)) {
    if (g_tap) {
      CFRelease(g_tap);
      g_tap = nullptr;
    }
    return Napi::Boolean::New(env, false);
  }

  if (!g_tsfnReady) {
    g_tsfn = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(), "keyhook", 8, 1);
    g_tsfnReady = true;
  }

  g_combos = std::move(combos);
  g_threadReady = false;
  g_running = true;

  g_thread = std::thread([] {
    g_source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), g_source, kCFRunLoopCommonModes);
    g_runLoop = CFRunLoopGetCurrent();
    {
      std::lock_guard<std::mutex> lock(g_mutex);
      g_threadReady = true;
    }
    g_cv.notify_all();
    CGEventTapEnable(g_tap, true);
    CFRunLoopRun();
  });

  return Napi::Boolean::New(env, true);
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  stopInternal();
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value IsRunning(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), g_running.load());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("isRunning", Napi::Function::New(env, IsRunning));
  return exports;
}

NODE_API_MODULE(keyhook, Init)

}  // namespace
