#!/bin/sh
# Start both backend (tsx watch) and frontend (vite dev) for development

set -e

# Start backend in background
echo "Starting backend dev server..."
cd /app/backend && npm run dev &
BACKEND_PID=$!

# Start frontend in background
echo "Starting frontend dev server..."
cd /app/frontend && npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend API: http://localhost:4000"
echo "Frontend:    http://localhost:3000"

# Wait for either process to exit
wait -n $BACKEND_PID $FRONTEND_PID

echo "One of the dev servers exited. Shutting down..."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
