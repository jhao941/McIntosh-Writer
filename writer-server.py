#!/usr/bin/env python3
"""McIntosh Writer 的本地服务器：提供网页文件，并把页面录下的视频转成 H.264 MP4（需要 ffmpeg）。

    python3 writer-server.py 8000
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import sys


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 256 * 1024 * 1024
# 页面录下的视频格式 → ffmpeg 的输入格式。只认这两种，并且让 ffmpeg 按指定格式读：
# 不让它按内容自己猜（猜成播放列表之类的格式，就可能去读本机的其他文件或者访问网络）
INPUT_FORMATS = {"video/webm": ("webm", "input.webm"), "video/mp4": ("mp4", "input.mp4")}
# 一次只转一个视频
CONVERTING = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # 让浏览器每次都先问一下文件改了没有（没改就回 304 照用缓存）：
        # 更新以后刷新页面就是新的，不会一直用缓存里的旧脚本
        if self.command in ("GET", "HEAD"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def same_origin(self):
        # 别的网站也能让浏览器往本机端口发 POST（不需要预检），所以只接受这个页面自己发来的：
        # Host 必须是本机（防 DNS rebinding），带了 Origin 的话也必须是本机这个端口
        port = self.server.server_address[1]
        hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        origin = self.headers.get("Origin")
        return self.headers.get("Host") in hosts and (origin is None or origin in {f"http://{h}" for h in hosts})

    def do_POST(self):
        if self.path != "/convert/mp4":
            self.send_error(404)
            return
        if not self.same_origin():
            self.send_error(403)
            return
        fmt = INPUT_FORMATS.get(self.headers.get("Content-Type", "").split(";")[0].strip().lower())
        if not fmt:
            self.send_error(415, "unsupported video type")
            return

        ffmpeg = shutil.which("ffmpeg")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not ffmpeg:
            self.send_error(503, "ffmpeg is not installed")
            return
        if length <= 0 or length > MAX_UPLOAD:
            self.send_error(413, "video is too large")
            return
        if not CONVERTING.acquire(blocking=False):
            self.send_error(429, "another video is being converted")
            return

        try:
            source_data = self.rfile.read(length)
            with tempfile.TemporaryDirectory(prefix="mcintosh-writer-") as temp_dir:
                source = Path(temp_dir) / fmt[1]
                output = Path(temp_dir) / "output.mp4"
                source.write_bytes(source_data)
                command = [
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-protocol_whitelist", "file", "-f", fmt[0],
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
        finally:
            CONVERTING.release()

        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(result)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(result)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
