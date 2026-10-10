#!/bin/zsh
# Copies the canonical shared header into every sketch folder (the Arduino IDE
# only compiles files inside the sketch folder). Run after editing
# firmware/common/civicmesh_common.h.
set -e
cd "$(dirname "$0")"
for sketch in radio_test field_node base_station; do
  cp common/civicmesh_common.h "$sketch/civicmesh_common.h"
done
echo "synced civicmesh_common.h into radio_test, field_node, base_station"
