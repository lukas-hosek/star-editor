STARTED_SERVER=0
if ! python3 -c "import socket; s=socket.socket(); s.connect(('localhost',8080)); s.close()" 2>/dev/null; then
    python3 -m http.server 8080 > server.log 2>&1 &
    SERVER_PID=$!
    STARTED_SERVER=1
    sleep 5
fi

echo "Server running on port 8080"
chromium-browser --headless --disable-gpu --dump-dom "http://localhost:8080/index.html" > dom_dump.txt 2>/dev/null
echo "--- DOM Check ---"
grep "id=\"sky\"" dom_dump.txt && echo "Found #sky"
grep "id=\"panel\"" dom_dump.txt && echo "Found #panel"
echo "--- Log Check ---"
if [ $STARTED_SERVER -eq 1 ]; then
    grep " 200 " server.log | grep "/js/" | grep -E "(renderer.js|renderer-pipeline.js|renderer-overlay.js|renderer-star-buffer.js|camera.js)"
    kill $SERVER_PID
    rm server.log
fi
rm dom_dump.txt
