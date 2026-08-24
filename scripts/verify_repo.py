#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PACKAGE = "hacker-house-medellin/hhm-interfaces"
EXPECTED_REPOSITORY = "https://github.com/hacker-house-medellin/hhm-interfaces"


def main() -> int:
    metadata = json.loads((ROOT / "project.json").read_text(encoding="utf-8"))
    required = [
        "README.md",
        "AGENTS.md",
        "project.json",
        "docs/architecture.md",
        "docs/mobile-presence-boundary.md",
        "schemas/visitor-access.json",
        ".zpkg.toml",
        *metadata.get("required_paths", []),
    ]
    missing = [path for path in required if not (ROOT / path).exists()]
    if missing:
        raise SystemExit(f"missing required paths: {missing}")

    openapi = json.loads((ROOT / "openapi/openapi.json").read_text(encoding="utf-8"))
    required_visitor_paths = {
        "/v1/visitor-qr/{action}",
        "/v1/visits/check-in",
        "/v1/visits/check-out",
    }
    missing_visitor_paths = required_visitor_paths - set(openapi.get("paths", {}))
    if missing_visitor_paths:
        raise SystemExit(f"missing visitor OpenAPI paths: {sorted(missing_visitor_paths)}")

    visitor_contract = json.loads(
        (ROOT / "schemas/visitor-access.json").read_text(encoding="utf-8")
    )
    required_visitor_definitions = {
        "IssueQrRequest",
        "IssuedQr",
        "CheckInRequest",
        "CheckInReceipt",
        "CheckOutRequest",
        "CheckOutReceipt",
        "ApiError",
    }
    missing_visitor_definitions = required_visitor_definitions - set(
        visitor_contract.get("$defs", {})
    )
    if missing_visitor_definitions:
        raise SystemExit(
            f"missing visitor schema definitions: {sorted(missing_visitor_definitions)}"
        )

    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts or path.stat().st_size > 1_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if any(marker in text for marker in ("<" * 7, "=" * 7, ">" * 7)):
            raise SystemExit(f"conflict marker in {path}")
        if re.search(
            r"gh[pousr]_[A-Za-z0-9]{20,}|lin_api_[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY",
            text,
        ):
            raise SystemExit(f"credential-shaped content in {path}")

    manifest = tomllib.loads((ROOT / ".zpkg.toml").read_text(encoding="utf-8"))
    package = manifest.get("package", {})
    coordinate = f"{package.get('org')}/{package.get('name')}"
    if coordinate != EXPECTED_PACKAGE:
        raise SystemExit(f"unexpected Zed package identity: {coordinate}")
    if package.get("version") != "0.1.0":
        raise SystemExit("Zed package version must remain 0.1.0")
    if package.get("language") != "universal":
        raise SystemExit("Zed package language must use the supported universal variant")
    repository = package.get("repository", {})
    if repository.get("vcs") != "git" or repository.get("url") != EXPECTED_REPOSITORY:
        raise SystemExit("Zed package repository identity is not canonical")
    publish = manifest.get("publish", {})
    if publish.get("tag_format") != "v{version}":
        raise SystemExit("Zed package tag format must remain v{version}")
    dependencies = manifest.get("dependencies", {})
    if dependencies not in ({}, None):
        raise SystemExit("interface package must remain a dependency root")
    target = manifest.get("targets", {}).get("repository")
    if target is not None and target.get("dir") != ".":
        raise SystemExit("repository target must publish the repository root")

    print(f"validated {metadata['organization']}/{metadata['repository']} and {EXPECTED_PACKAGE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
