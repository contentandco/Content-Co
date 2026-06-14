import http.server
import socketserver
import pathlib

# Port to serve on – you can change this if needed
PORT = 8000

# Directory containing the site (the folder where this script lives)
WEB_DIR = pathlib.Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    """Serve files from the project directory.
    Using `directory` ensures the server works regardless of where you launch it.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def address_string(self):
        # Prevent reverse DNS lookup to speed up requests on macOS
        return self.client_address[0]

    def log_message(self, format, *args):
        # Disable logging to eliminate terminal print / disk I/O delay
        pass

if __name__ == "__main__":
    # Use ThreadingTCPServer to handle concurrent requests from browsers
    with socketserver.ThreadingTCPServer(("", PORT), Handler) as httpd:
        print(f"🚀 Serving Content & Co at http://localhost:{PORT}")
        print("Press Ctrl+C to stop the server.")
        httpd.serve_forever()
