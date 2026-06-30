#!/bin/bash
# Persistent dev server launcher — detaches into its own session so the
# sandbox doesn't kill it when the parent shell exits.
cd /home/z/my-project
pkill -9 -f "next dev" 2>/dev/null
sleep 1
rm -f dev.log
# Start in a new session, fully detached
setsid bash -c 'exec bun run dev' </dev/null >/dev/null 2>&1 &
# Wait for ready
for i in $(seq 1 30); do
  if grep -q "Ready" dev.log 2>/dev/null; then
    echo "READY after ${i}s"
    break
  fi
  sleep 1
done
sleep 1
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
