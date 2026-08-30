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
        "docs/p2p-bluetooth-boundary.md",
        "fixtures/doorway-observation.json",
        "fixtures/p2p-json-records.json",
        "fixtures/peer-session.json",
        "schemas/doorway-observation.json",
        "schemas/p2p-json-records.json",
        "schemas/peer-session.json",
        "schemas/visitor-access.json",
        "typespec/main.tsp",
        "generated/openapi/intake.openapi.yaml",
        "generated/json-schema/ApplicationCreate.yaml",
        "generated/json-schema/PreInterestCreate.yaml",
        "generated/json-schema/ReferralCreate.yaml",
        "docs/intake-privacy-boundary.md",
        ".zpkg.toml",
        *metadata.get("required_paths", []),
    ]
    missing = [path for path in required if not (ROOT / path).exists()]
    if missing:
        raise SystemExit(f"missing required paths: {missing}")

    openapi = json.loads((ROOT / "openapi/openapi.json").read_text(encoding="utf-8"))
    required_api_paths = {
        "/v1/visitor-qr/{action}",
        "/v1/visits/check-in",
        "/v1/visits/check-out",
        "/v1/presence/submission-nonces",
        "/v1/presence/observations",
    }
    missing_api_paths = required_api_paths - set(openapi.get("paths", {}))
    if missing_api_paths:
        raise SystemExit(f"missing required OpenAPI paths: {sorted(missing_api_paths)}")

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

    peer_contract = json.loads(
        (ROOT / "schemas/peer-session.json").read_text(encoding="utf-8")
    )
    required_peer_definitions = {
        "HandshakeRequest",
        "HandshakeResponse",
        "EncryptedEnvelope",
        "SignedUpdateManifest",
    }
    missing_peer_definitions = required_peer_definitions - set(
        peer_contract.get("$defs", {})
    )
    if missing_peer_definitions:
        raise SystemExit(
            f"missing peer-session schema definitions: {sorted(missing_peer_definitions)}"
        )

    peer_text = json.dumps(peer_contract, sort_keys=True)
    required_peer_guards = {
        '"const": "hhm.p2p.v1"',
        '"const": "hhm.update-manifest.v1"',
        '"maxLength": 87384',
        '"maximum": 2147483648',
        '"pattern": "^https://"',
    }
    missing_peer_guards = {
        guard for guard in required_peer_guards if guard not in peer_text
    }
    if missing_peer_guards:
        raise SystemExit(
            f"missing peer-session safety guards: {sorted(missing_peer_guards)}"
        )

    doorway_contract = json.loads(
        (ROOT / "schemas/doorway-observation.json").read_text(encoding="utf-8")
    )
    required_doorway_definitions = {
        "DoorwayChallenge",
        "CorroborationEvidence",
        "PresenceSubmissionNonceRequest",
        "PresenceSubmissionNonce",
        "DoorwayObservation",
        "PresenceDecision",
        "PresenceApiError",
    }
    missing_doorway_definitions = required_doorway_definitions - set(
        doorway_contract.get("$defs", {})
    )
    if missing_doorway_definitions:
        raise SystemExit(
            f"missing doorway schema definitions: {sorted(missing_doorway_definitions)}"
        )

    doorway_text = json.dumps(doorway_contract, sort_keys=True)
    required_doorway_guards = {
        '"const": "hhm.doorway-observation.v1"',
        '"const": "hhm-presence-observation"',
        '"enum": ["contact", "doorway", "near"]',
        '"maxLength": 4096',
    }
    missing_doorway_guards = {
        guard for guard in required_doorway_guards if guard not in doorway_text
    }
    if missing_doorway_guards:
        raise SystemExit(
            f"missing doorway safety guards: {sorted(missing_doorway_guards)}"
        )

    p2p_records = json.loads(
        (ROOT / "schemas/p2p-json-records.json").read_text(encoding="utf-8")
    )
    required_record_definitions = {
        "ContactCard",
        "ResidentMessage",
        "PeerReceipt",
        "P2pJsonRecord",
    }
    missing_record_definitions = required_record_definitions - set(
        p2p_records.get("$defs", {})
    )
    if missing_record_definitions:
        raise SystemExit(
            f"missing P2P JSON definitions: {sorted(missing_record_definitions)}"
        )

    record_text = json.dumps(p2p_records, sort_keys=True)
    required_record_guards = {
        '"const": "plain_text"',
        '"const": "hhm.contact-card.v1"',
        '"const": "hhm.receipt.v1"',
        '"maxLength": 4096',
    }
    missing_record_guards = {
        guard for guard in required_record_guards if guard not in record_text
    }
    if missing_record_guards:
        raise SystemExit(
            f"missing P2P JSON safety guards: {sorted(missing_record_guards)}"
        )

    for fixture_path in (
        "fixtures/doorway-observation.json",
        "fixtures/p2p-json-records.json",
    ):
        json.loads((ROOT / fixture_path).read_text(encoding="utf-8"))

    for path in ROOT.rglob("*"):
        if (
            not path.is_file()
            or any(part in {".git", "node_modules", "target"} for part in path.parts)
            or path.stat().st_size > 1_000_000
        ):
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
