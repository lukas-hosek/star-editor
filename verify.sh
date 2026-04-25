PORT=$(python3 -c "import socket; s = socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")
python3 -m http.server $PORT > server.log 2>&1 &
SERVER_PID=$!
sleep 5
echo "Server running on port $PORT"
chromium-browser --headless --disable-gpu --dump-dom "http://localhost:$PORT/index.html" > dom_dump.txt 2>/dev/null
echo "--- DOM Check ---"
grep "id=\"sky\"" dom_dump.txt && echo "Found #sky"
grep "id=\"panel\"" dom_dump.txt && echo "Found #panel"
echo "--- Log Check ---"
grep " 200 " server.log | grep "/js/" | grep -E "(renderer.js|renderer-pipeline.js|renderer-overlay.js|renderer-star-buffer.js|camera.js)"
kill $SERVER_PID
rm dom_dump.txt server.log
