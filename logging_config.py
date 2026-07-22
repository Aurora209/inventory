"""Centralized logging configuration using dictConfig.

Provides a console handler and an optional rotating file handler. This
function is idempotent — calling it multiple times will not add duplicate
handlers.
"""
from __future__ import annotations

import logging
import os
from logging.config import dictConfig


def setup_logging(
    debug: bool = False,
    log_dir: str | None = None,
    log_file: str = "backend.log",
    max_bytes: int = 10 * 1024 * 1024,
    backup_count: int = 5,
    log_to_file: bool = True,
):
    """Configure logging using dictConfig.

    Args:
        debug: enable DEBUG level if True, otherwise INFO.
        log_dir: directory where log files are written. If None, uses
            <project_root>/logs. If log_to_file is False, this is ignored.
        log_file: name of the log file under log_dir.
        max_bytes: max size in bytes for rotation.
        backup_count: number of rotated files to keep.
        log_to_file: enable rotating file handler when True.
    """
    level = "DEBUG" if debug else "INFO"

    # allow environment variables to override
    env_level = os.environ.get("LOG_LEVEL")
    if env_level:
        level = env_level.upper()

    env_log_dir = os.environ.get("LOG_DIR")
    env_log_file = os.environ.get("LOG_FILE")
    env_log_to_file = os.environ.get("LOG_TO_FILE")

    if log_file is None and env_log_file:
        log_file = env_log_file

    # determine log directory (priority: explicit arg > env var > default)
    if log_dir is None:
        if env_log_dir:
            log_dir = env_log_dir
        else:
            # place logs next to this package (backend/logs)
            here = os.path.dirname(os.path.abspath(__file__))
            log_dir = os.path.join(os.path.dirname(here), "logs")

    if env_log_to_file is not None:
        # treat '0','false','False' as disable
        if env_log_to_file.lower() in ("0", "false", "no"):
            log_to_file = False
        else:
            log_to_file = True

    if log_to_file and log_dir and not os.path.exists(log_dir):
        try:
            os.makedirs(log_dir, exist_ok=True)
        except Exception:
            # If directory cannot be created, fall back to console only
            log_to_file = False

    handlers: dict = {
        "console": {
            "class": "logging.StreamHandler",
            "level": level,
            "formatter": "standard",
            "stream": "ext://sys.stdout",
        }
    }

    if log_to_file:
        file_path = os.path.join(log_dir, log_file)
        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "level": level,
            "formatter": "standard",
            "filename": file_path,
            "mode": "a",
            "maxBytes": max_bytes,
            "backupCount": backup_count,
            "encoding": "utf-8",
        }

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s"
            }
        },
        "handlers": handlers,
        "root": {"level": level, "handlers": list(handlers.keys())},
    }

    # Apply the configuration. dictConfig is idempotent enough for repeated
    # calls; if something goes wrong, revert to a simple basicConfig.
    try:
        dictConfig(config)
    except Exception:
        logging.basicConfig(level=logging.DEBUG if debug else logging.INFO)
