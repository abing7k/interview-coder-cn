#!/usr/bin/env bash
#
# 本地测试版 macOS 打包脚本（个人本地使用，不提交上游）
#
# 与官方原版「截屏解题助手」完全隔离，避免同一台机器上互相干扰：
#   - 应用名不同      截屏解题助手-测试
#   - Bundle ID 不同  com.abing7k.ictest
#   - 产物目录独立    release-test/
#
# 用法：
#   ./scripts/build-mac-test.sh            # 打包 arm64
#   ./scripts/build-mac-test.sh --install  # 打包并安装到 /Applications
#
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME='截屏解题助手-测试'
BUNDLE_ID='com.abing7k.ictest'
OUT_DIR='release-test'

echo "==> 编译渲染层与主进程"
npx electron-vite build

echo "==> 打包 macOS 应用 名称=$APP_NAME  BundleID=$BUNDLE_ID"
npx electron-builder --mac --arm64 \
  -c.productName="$APP_NAME" \
  -c.appId="$BUNDLE_ID" \
  -c.directories.output="$OUT_DIR"

APP_PATH="$OUT_DIR/mac-arm64/$APP_NAME.app"
echo "==> 产物: $APP_PATH"

if [[ "${1:-}" == "--install" ]]; then
  TARGET="/Applications/$APP_NAME.app"
  echo "==> 安装到 $TARGET"

  # 先停掉正在运行的测试版，否则覆盖安装会留下陈旧的进程
  pkill -f "MacOS/$APP_NAME" 2>/dev/null || true
  sleep 1

  rm -rf "$TARGET"
  cp -R "$APP_PATH" "$TARGET"

  # macOS 会把从命令行复制的应用标记为「已隔离」，不解掉打不开
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

  echo "==> 校验签名"
  codesign --verify --verbose=1 "$TARGET"

  echo "==> 打开应用"
  open "$TARGET"
fi

echo "==> 完成"
