#!/usr/bin/env python3
"""Environment preflight for the presentation-maker skill.

Prints a single JSON line so the calling agent can branch on `status`:
OK | PYTHON_TOO_OLD | MISSING_DEPS. (A missing python3 binary cannot be
reported from here; the skill instructions handle that case.)
"""
import json
import os
import sys

MIN_VERSION = (3, 9)


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    if sys.version_info < MIN_VERSION:
        print(json.dumps({
            "status": "PYTHON_TOO_OLD",
            "python": ".".join(map(str, sys.version_info[:3])),
            "fix": "Install Python %s+ (macOS: brew install python3)" % ".".join(map(str, MIN_VERSION)),
        }))
        return 1

    missing = []
    try:
        import pptx  # noqa: F401
    except ImportError:
        missing.append("pptx")

    if missing:
        print(json.dumps({
            "status": "MISSING_DEPS",
            "missing": missing,
            "fix": "pip3 install -r %s" % os.path.join(here, "requirements.txt"),
        }))
        return 1

    print(json.dumps({"status": "OK", "python": ".".join(map(str, sys.version_info[:3]))}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
