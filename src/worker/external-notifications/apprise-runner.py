import json
import sys

import apprise


def _fail(message: str, *, exit_code: int = 1) -> None:
    sys.stdout.write(json.dumps({"success": False, "error": message}) + "\n")
    sys.stdout.flush()
    raise SystemExit(exit_code)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        _fail("Invalid JSON payload")

    urls = payload.get("urls") or []
    if not isinstance(urls, list):
        _fail("Invalid urls: expected list")

    title = payload.get("title") or ""
    body = payload.get("body") or ""
    notify_type = (payload.get("notifyType") or "info").lower()

    if notify_type not in {"info", "success", "warning", "failure"}:
        notify_type = "info"

    if not isinstance(title, str) or not isinstance(body, str):
        _fail("Invalid title/body")

    apobj = apprise.Apprise()
    added = 0

    for raw in urls:
        if not isinstance(raw, str):
            continue
        url = raw.strip()
        if not url:
            continue
        try:
            if apobj.add(url):
                added += 1
        except Exception:
            # Ignore individual bad URLs; caller is expected to validate inputs upstream.
            continue

    if added == 0:
        _fail("No valid notification destinations")

    try:
        ok = bool(apobj.notify(title=title, body=body, notify_type=notify_type))
    except Exception as exc:
        sys.stderr.write(f"Apprise notify failed: {exc!s}\n")
        sys.stderr.flush()
        _fail("Apprise notify failed")

    sys.stdout.write(json.dumps({"success": ok, "destinations": added}) + "\n")
    sys.stdout.flush()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
