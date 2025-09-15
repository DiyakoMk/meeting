# config.py
# Load configuration values from environment variables (supports .env file)
import os


def _load_env_from_dotenv() -> None:
    """Load environment variables from a .env file if available.

    - First tries python-dotenv if installed.
    - Falls back to a minimal manual parser to avoid hard dependency.
    """
    try:
        # Preferred: python-dotenv (if installed)
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()  # loads from .env in CWD or project root
        return
    except Exception:
        # Optional dependency may not be installed; continue with manual fallback
        pass

    # Fallback: load .env that sits next to this file
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.isfile(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    os.environ.setdefault(key, value)
        except Exception:
            # Ignore .env read errors silently to not crash the app
            pass


# Attempt to populate environment from .env (if any)
_load_env_from_dotenv()

# Public settings consumed by the rest of the app
BOT_TOKEN: str | None = os.getenv("BOT_TOKEN")
DB_NAME: str = os.getenv("DB_NAME", "bot.db")

# MAIN_ADMIN_ID should be an integer or None
_main_admin = os.getenv("MAIN_ADMIN_ID")
try:
    MAIN_ADMIN_ID: int | None = int(_main_admin) if _main_admin else None
except ValueError:
    MAIN_ADMIN_ID = None

# Fail fast if token is missing
if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN is not set. Define BOT_TOKEN in your environment or in a .env file."
    )
