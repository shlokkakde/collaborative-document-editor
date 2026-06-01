#!/usr/bin/env bash
set -euo pipefail

python manage.py migrate --noinput
python -m daphne core.asgi:application -b 0.0.0.0 -p "${PORT:-8000}"
