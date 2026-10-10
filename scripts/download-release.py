#!/usr/bin/env python3
"""Download a GitHub release artifact using a short-lived URL from SSH stdin."""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import zipfile


def main():
    if len(sys.argv) != 2 or not re.fullmatch(
        r"/opt/daoyou/incoming/[0-9]+-[0-9]+\.tgz", sys.argv[1]
    ):
        sys.exit("Unexpected release bundle path")
    url = sys.stdin.read().strip()
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname:
        sys.exit("Release download requires an HTTPS URL")
    bundle = Path(sys.argv[1])
    archive_path = bundle.with_suffix(".zip")
    temporary = bundle.with_suffix(".tgz.partial")
    parts = [bundle.with_suffix(f".zip.part{index}") for index in range(8)]
    try:
        with urlopen(Request(url, method="HEAD"), timeout=60) as response:
            size = int(response.headers["Content-Length"])
        if size <= 0:
            raise ValueError("Empty artifact")
        chunk_size = (size + len(parts) - 1) // len(parts)

        def download_part(index):
            start = index * chunk_size
            end = min(size, start + chunk_size) - 1
            request = Request(url, headers={"Range": f"bytes={start}-{end}"})
            with urlopen(request, timeout=60) as response, parts[index].open("wb") as output:
                expected = f"bytes {start}-{end}/{size}"
                if (
                    urlsplit(response.geturl()).scheme != "https"
                    or response.status != 206
                    or response.headers.get("Content-Range") != expected
                ):
                    raise ValueError("Unexpected artifact range response")
                shutil.copyfileobj(response, output)
            if parts[index].stat().st_size != end - start + 1:
                raise ValueError("Incomplete artifact range")

        with ThreadPoolExecutor(max_workers=len(parts)) as executor:
            list(executor.map(download_part, range(len(parts))))
        with archive_path.open("wb") as output:
            for part in parts:
                with part.open("rb") as source:
                    shutil.copyfileobj(source, output)
        with zipfile.ZipFile(archive_path) as archive:
            if archive.namelist() != ["daoyou-release.tgz"]:
                raise ValueError("Unexpected artifact contents")
            with archive.open("daoyou-release.tgz") as source, temporary.open("wb") as output:
                shutil.copyfileobj(source, output)
        os.replace(temporary, bundle)
        print(f"Release bundle downloaded: {bundle.stat().st_size} bytes")
    except Exception as error:
        # Signed URLs are credentials; exception text/tracebacks can expose them.
        status = getattr(error, "code", None)
        sys.exit(f"Release download failed: {type(error).__name__}, HTTP status={status}")
    finally:
        archive_path.unlink(missing_ok=True)
        temporary.unlink(missing_ok=True)
        for part in parts:
            part.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
