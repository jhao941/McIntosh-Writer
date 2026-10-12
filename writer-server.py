#!/usr/bin/env python3
"""Serve McIntosh Writer and convert recorded WebM videos to H.264 MP4."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 256 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # The local app is edited and relaunched frequently; do not let an
        # already-open browser keep an older exporter script in its cache.
        if self.command == "GET":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/convert/mp4":
            self.send_error(404)
            return

        ffmpeg = shutil.which("ffmpeg")
        length = int(self.headers.get("Content-Length", "0"))
        if not ffmpeg:
            self.send_error(503, "ffmpeg is not installed")
            return
        if length <= 0 or length > MAX_UPLOAD:
            self.send_error(413, "video is too large")
            return

        source_data = self.rfile.read(length)
        with tempfile.TemporaryDirectory(prefix="mcintosh-writer-") as temp_dir:
            source = Path(temp_dir) / "input.webm"
            output = Path(temp_dir) / "output.mp4"
            source.write_bytes(source_data)
            command = [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-profile:v", "main", "-level:v", "3.1",
                "-vf", "format=yuv420p", "-r", "60", "-fps_mode", "cfr",
                "-color_range", "tv", "-movflags", "+faststart",
                str(output),
            ]
            try:
                subprocess.run(command, check=True, timeout=300, capture_output=True)
            except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
                self.send_error(500, "MP4 conversion failed")
                return
            result = output.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(result)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(result)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
