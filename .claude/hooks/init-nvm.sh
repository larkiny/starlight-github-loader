#!/bin/bash
# Initialize nvm for Claude Code Bash commands
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NVM_DIR="$HOME/.nvm"' >> "$CLAUDE_ENV_FILE"
  echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> "$CLAUDE_ENV_FILE"
fi
exit 0
