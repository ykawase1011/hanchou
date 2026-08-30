#!/usr/bin/env python3
"""Generate and verify the tracked-file release manifest."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile


MANIFEST_NAME = "MANIFEST.sha256"


class ManifestError(RuntimeError):
    pass


def repository_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return Path(result.stdout.decode("utf-8").strip())


def tracked_paths(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "-z"],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    paths: list[str] = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        try:
            path = raw_path.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ManifestError("tracked paths must be valid UTF-8") from exc
        if path == MANIFEST_NAME:
            continue
        if "\n" in path or "\r" in path:
            raise ManifestError(f"tracked path cannot contain a newline: {path!r}")
        if path.startswith("/") or path == ".." or path.startswith("../"):
            raise ManifestError(f"tracked path is not repository-relative: {path!r}")
        paths.append(path)
    return sorted(paths, key=lambda value: value.encode("utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_manifest(root: Path, paths: list[str]) -> str:
    lines: list[str] = []
    for path in paths:
        absolute_path = root / path
        if not absolute_path.is_file():
            raise ManifestError(f"tracked file is missing from the worktree: {path}")
        lines.append(f"{sha256(absolute_path)}  ./{path}\n")
    return "".join(lines)


def generate(root: Path) -> None:
    paths = tracked_paths(root)
    rendered = render_manifest(root, paths)
    destination = root / MANIFEST_NAME
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=root,
            prefix=f".{MANIFEST_NAME}.",
            delete=False,
        ) as temporary:
            temporary.write(rendered)
            temporary_name = temporary.name
        os.chmod(temporary_name, 0o644)
        os.replace(temporary_name, destination)
        temporary_name = None
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)
    print(f"generated {MANIFEST_NAME}: {len(paths)} tracked files")


def parse_manifest(root: Path) -> dict[str, str]:
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file():
        raise ManifestError(f"{MANIFEST_NAME} is missing")
    entries: dict[str, str] = {}
    for line_number, line in enumerate(
        manifest_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if len(line) < 69 or line[64:68] != "  ./":
            raise ManifestError(
                f"{MANIFEST_NAME}:{line_number}: invalid checksum line"
            )
        digest = line[:64]
        path = line[68:]
        if any(character not in "0123456789abcdef" for character in digest):
            raise ManifestError(
                f"{MANIFEST_NAME}:{line_number}: invalid SHA-256 digest"
            )
        if not path or "\n" in path or "\r" in path:
            raise ManifestError(
                f"{MANIFEST_NAME}:{line_number}: invalid tracked path"
            )
        if path in entries:
            raise ManifestError(
                f"{MANIFEST_NAME}:{line_number}: duplicate path: {path}"
            )
        entries[path] = digest
    return entries


def verify(root: Path) -> None:
    expected_paths = tracked_paths(root)
    expected = set(expected_paths)
    entries = parse_manifest(root)
    recorded = set(entries)

    problems: list[str] = []
    for path in sorted(expected - recorded):
        problems.append(f"missing manifest entry: {path}")
    for path in sorted(recorded - expected):
        problems.append(f"manifest entry is not tracked: {path}")
    for path in sorted(expected & recorded):
        absolute_path = root / path
        if not absolute_path.is_file():
            problems.append(f"tracked file is missing from the worktree: {path}")
        elif sha256(absolute_path) != entries[path]:
            problems.append(f"checksum mismatch: {path}")

    if problems:
        raise ManifestError("\n".join(problems))
    print(
        f"validated {MANIFEST_NAME}: "
        f"{len(expected_paths)} tracked files and checksums"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("generate", "check"))
    args = parser.parse_args()
    try:
        root = repository_root()
        if args.command == "generate":
            generate(root)
        else:
            verify(root)
    except (ManifestError, OSError, subprocess.CalledProcessError) as exc:
        print(f"manifest error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
