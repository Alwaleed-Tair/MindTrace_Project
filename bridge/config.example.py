"""Optional defaults for the bridge. Copy to config.py (git-ignored) and edit; command-line flags and environment
variables override it. Never put the API key here if the file could be committed: use the environment instead."""
PLATFORM_URL = "http://localhost:8000"          # where the backend runs
SESSIONS_DIR = r"..\MindTrace2\sessions"         # the laptop app's sessions folder (MindTrace2/sessions)
UPLOAD_FULL_RECORDING = True                    # also upload full_session.wav (big: ~1 MB per 30 s)
WATCH_INTERVAL_SEC = 20                         # --watch: look for new sessions this often
# The API token: set the environment variable MINDTRACE_API_TOKEN (create it in the web app, Settings) instead of writing it here.
