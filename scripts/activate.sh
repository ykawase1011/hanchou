#!/usr/bin/env bash
# Source this file: `. scripts/activate.sh work`
PROFILE="${1:-work}"
case "$PROFILE" in
  work|personal) ;;
  *) echo "unknown profile: $PROFILE" >&2; return 2 2>/dev/null || exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export HANCHOU_PROFILE="$PROFILE"
export HANCHOU_CONFIG_ROOT="${HANCHOU_CONFIG_ROOT:-$ROOT/config}"
export HANCHOU_HOME="$HOME/.local/share/hanchou/$PROFILE"
export HANCHOU_CONFIG_HOME="$HOME/.config/hanchou/$PROFILE"
export HANCHOU_BEADS_DIR="$HANCHOU_HOME/control/.beads"
export HANCHOU_RELAY_DIR="$HANCHOU_HOME/relay"
export BEADS_DIR="$HANCHOU_BEADS_DIR"
export BD_AGENT_PROFILE="conservative"
export PATH="$ROOT/bin:$PATH"

if [[ "$PROFILE" == "work" ]]; then
  export HANCHOU_TASK_UI="http://127.0.0.1:3737"
else
  export HANCHOU_TASK_UI="http://127.0.0.1:3837"
fi

echo "activated Hanchou profile: $PROFILE"
echo "BEADS_DIR=$BEADS_DIR"
echo "Task UI=$HANCHOU_TASK_UI"
