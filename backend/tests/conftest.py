import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MINDTRACE_DATA_DIR", tempfile.mkdtemp(prefix="mindtrace-import-"))   # `import main` creates its app at import time
sys.path.insert(0, str(Path(__file__).resolve().parent))
