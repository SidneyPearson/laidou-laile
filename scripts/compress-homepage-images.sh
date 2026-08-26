#!/usr/bin/env bash
#
# 压缩首页图片（hero + 4 张画像卡）。
#
# 用法：
#   1. 把大图放进项目根目录的 raw-images/homepage/，文件名用以下任一名字：
#        hero / 封面 / 01          -> 首页大封面
#        couple / 情侣 / 约会 / 02  -> 情侣约会
#        family / 亲子 / 03         -> 亲子玩乐
#        fast / soldier / 特种兵 / 04 -> 特种兵式
#        lazy / 懒人 / 05           -> 懒人躺平
#      支持 .png/.jpg/.jpeg/.webp（sips 能读的都行）。
#   2. 运行：npm run img:compress
#
# 脚本会自动转成 JPG（质量 82）、按目标尺寸缩小、替换 assets/homepage 里的正式图，
# 并在替换前把旧文件备份到 /tmp。替换完记得重新 build + 部署。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/raw-images/homepage"
DST_DIR="$ROOT/client/src/assets/homepage"
QUALITY=82
HERO_MAX=2160  # hero 最长边上限（3x 屏满屏清晰）
CARD_MAX=1080  # 画像卡最长边上限（3 倍屏清晰）
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/tmp/homepage-img-backup-$STAMP"

if ! command -v sips >/dev/null 2>&1; then
  echo "❌ 找不到 sips（需要 macOS 自带的图像处理工具）。" >&2
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "❌ 源目录不存在：$SRC_DIR" >&2
  echo "   请先创建该目录并把要压缩的大图放进去。" >&2
  exit 1
fi

shopt -s nullglob nocaseglob
src_files=("$SRC_DIR"/*)
if [ ${#src_files[@]} -eq 0 ]; then
  echo "⚠️  $SRC_DIR 里没有图片。" >&2
  exit 0
fi

mkdir -p "$BACKUP_DIR"
count=0

process() {
  local key="$1" src="$2" dst="$3" maxpx="$4"
  local ext
  ext=$(echo "${src##*.}" | tr '[:lower:]' '[:upper:]')
  echo "  $key  -> $(basename "$dst")"

  if [ -f "$dst" ]; then
    cp "$dst" "$BACKUP_DIR/"
  fi

  local before
  before=$(stat -f%z "$src" 2>/dev/null || echo 0)

  sips -s format jpeg -s formatOptions "$QUALITY" -Z "$maxpx" "$src" --out "$dst" >/dev/null

  local after
  after=$(stat -f%z "$dst" 2>/dev/null || echo 0)
  printf "       %s -> JPG （%d KB -> %d KB）\n" \
    "$ext" "$((before/1024))" "$((after/1024))"
  count=$((count+1))
}

echo "🔍 扫描 $SRC_DIR ..."
for src in "${src_files[@]}"; do
  [ -f "$src" ] || continue
  base="$(basename "$src")"
  name="${base%.*}"
  lc="$(echo "$name" | tr '[:upper:]' '[:lower:]')"

  case "$lc" in
    hero|封面|01*)
      process hero "$src" "$DST_DIR/01-hero-shanghai-cover.jpg" "$HERO_MAX" ;;
    couple|情侣|约会|02*)
      process couple "$src" "$DST_DIR/02-persona-couple.jpg" "$CARD_MAX" ;;
    family|亲子|03*)
      process family "$src" "$DST_DIR/03-persona-family.jpg" "$CARD_MAX" ;;
    fast|soldier|特种兵|04*)
      process fast "$src" "$DST_DIR/04-persona-soldier.jpg" "$CARD_MAX" ;;
    lazy|懒人|05*)
      process lazy "$src" "$DST_DIR/05-persona-lazy.jpg" "$CARD_MAX" ;;
    *)
      echo "  ⏭️  跳过无法识别的文件：$base（文件名需含 hero/couple/family/fast/lazy 或 情侣/亲子/特种兵/懒人）" ;;
  esac
done

echo ""
if [ "$count" -gt 0 ]; then
  echo "✅ 已压缩 $count 张，旧文件备份在：$BACKUP_DIR"
  echo "   接下来：npm run build -w client && npm run bundle -w server && 部署"
else
  echo "⚠️  没有匹配到可处理的图片。"
fi
