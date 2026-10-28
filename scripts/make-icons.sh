#!/bin/bash
# Rigenera le icone (marchio a 4 barrette, D-32) in assets/. Uso: scripts/make-icons.sh assets
set -e
cd "$1"
W=110; H=220; G=36; TOT=$((4*W+3*G)); X0=$(((1024-TOT)/2)); Y0=$(((1024-H)/2))
boxes() { local out="" i=0; for c in "$@"; do x=$((X0+i*(W+G))); out="$out,drawbox=x=${x}:y=${Y0}:w=${W}:h=${H}:color=${c}:t=fill"; i=$((i+1)); done; echo "${out#,}"; }
COL="0xD9382C 0xEF8A33 0xF3BE3E 0xEEE5C6"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
ff -f lavfi -i "color=c=0x121110:s=1024x1024" -frames:v 1 -vf "$(boxes $COL)" icon.png
# drawbox non scrive il canale alfa: colori su fondo opaco + maschera delle barrette, unite con alphamerge.
MASK="color=c=black:s=1024x1024,format=gray,$(boxes white white white white)"
ff -f lavfi -i "color=c=black:s=1024x1024,$(boxes $COL)" -f lavfi -i "$MASK" -frames:v 1 \
  -filter_complex "[0:v]format=rgba[c];[1:v]format=gray[m];[c][m]alphamerge" android-icon-foreground.png
ff -f lavfi -i "color=c=white:s=1024x1024" -f lavfi -i "$MASK" -frames:v 1 \
  -filter_complex "[0:v]format=rgba[c];[1:v]format=gray[m];[c][m]alphamerge" android-icon-monochrome.png
ff -f lavfi -i "color=c=0x121110:s=1024x1024" -frames:v 1 android-icon-background.png
cp android-icon-foreground.png splash-icon.png
ff -i icon.png -vf scale=48:48 favicon.png
