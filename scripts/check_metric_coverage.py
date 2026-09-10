#!/usr/bin/env python3
"""
Pre-release check: verify every frontend MetricId resolves to a column present
in the prod GCS export bucket. Run before cutting a release.

Usage:
    GCS_BUCKET=het-public python3 scripts/check_metric_coverage.py
    python3 scripts/check_metric_coverage.py --bucket het-public

Exits 0 when all metrics are present; exits 1 if any are missing.
Pass --warn-only to always exit 0 (surface the report without blocking).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROVIDERS_DIR = REPO_ROOT / "frontend" / "src" / "data" / "providers"

# Maps each provider file to the DAG workflow(s) that produce its data.
# When a metric from this provider is missing in prod, running the listed
# workflow(s) against the production project will repair the gap.
PROVIDER_TO_DAGS: dict[str, list[str]] = {
    "AhrProvider.ts": ["dagAhr", "dagAhrBehavioralHealth", "dagChr"],
    "HivProvider.ts": ["dagCdcHiv"],
    "HivBlackWomenProvider.ts": ["dagCdcHivBlackWomen"],
    "GunViolenceProvider.ts": ["dagCdcWisqarsGunDeaths"],
    "GunViolenceYouthProvider.ts": ["dagCdcWisqarsYouthGunDeaths"],
    "GunDeathsBlackMenProvider.ts": ["dagCdcWisqarsBlackMenGunDeaths"],
    "MaternalMortalityProvider.ts": ["dagMaternalMortality"],
    "PhrmaProvider.ts": ["dagPhrma"],
    "PhrmaBrfssProvider.ts": ["dagPhrmaBrfss"],
    "IncarcerationProvider.tsx": ["dagBjsIncarceration", "dagVeraIncarcerationCounty"],
    "CdcCancerProvider.ts": ["dagNciCancer", "dagCdcWonderCancer"],
    "CdcCovidProvider.ts": ["dagCdcRestrictedCovid", "dagCdcVaccinationNational"],
    "VaccineProvider.ts": ["dagCdcVaccinationNational", "dagKffVaccinationState"],
    "CawpProvider.ts": ["dagCawp"],
    "AcsConditionProvider.ts": ["dagAcsCondition"],
    "GeoContextProvider.ts": ["dagGeoContext"],
}

# AHR behavioral health topics generate separate GCS files from a separate DAG.
# Metrics whose name starts with any of these prefixes come from dagAhrBehavioralHealth;
# all other AHR metrics come from dagAhr.
AHR_BEHAVIORAL_PREFIXES = (
    "depression_",
    "non_medical_drug_use_",
    "excessive_drinking_",
    "frequent_mental_distress_",
    "suicide_",
)


def extract_metric_ids(file_path: Path) -> set[str]:
    """Return all MetricId string literals from TypeScript MetricId[] arrays."""
    content = file_path.read_text()
    metric_ids: set[str] = set()

    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        # Detect the start of a MetricId[] typed array declaration
        if re.search(r":\s*MetricId\[\]\s*=\s*\[", line):
            block = line
            depth = line.count("[") - line.count("]")
            j = i + 1
            while depth > 0 and j < len(lines):
                block += "\n" + lines[j]
                depth += lines[j].count("[") - lines[j].count("]")
                j += 1
            for m in re.finditer(r"'([^']+)'", block):
                val = m.group(1)
                # MetricIds are snake_case with underscores; skip short strings,
                # display labels, geography names, etc.
                if re.match(r"^[a-z][a-z0-9_]+$", val) and "_" in val:
                    metric_ids.add(val)
            i = j
        else:
            i += 1

    return metric_ids


def get_dags_for_metric(provider_file: str, metric_id: str) -> list[str]:
    """Narrow the AHR DAG for behavioral vs. non-behavioral metrics."""
    dags = PROVIDER_TO_DAGS.get(provider_file, ["(unknown DAG)"])
    if provider_file != "AhrProvider.ts":
        return dags
    if any(metric_id.startswith(p) for p in AHR_BEHAVIORAL_PREFIXES):
        return ["dagAhrBehavioralHealth"]
    if metric_id.startswith("chr_"):
        return ["dagChr"]
    return ["dagAhr"]


def list_national_files(bucket: str) -> list[str]:
    """Return GCS paths for all *_national_current.json files in the bucket."""
    try:
        result = subprocess.run(
            ["gsutil", "ls", f"gs://{bucket}/"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except FileNotFoundError:
        print("ERROR: gsutil not found. Install the Google Cloud SDK and authenticate.", file=sys.stderr)
        sys.exit(2)
    except subprocess.TimeoutExpired:
        print("ERROR: gsutil ls timed out.", file=sys.stderr)
        sys.exit(2)

    if result.returncode != 0:
        print(f"ERROR: gsutil ls failed:\n{result.stderr.strip()}", file=sys.stderr)
        sys.exit(2)

    return [
        line.strip()
        for line in result.stdout.splitlines()
        if "_national_current.json" in line
        or "_alls_national.json" in line
        or ("chr_data-" in line and "_county_current.json" in line)
    ]


def get_columns(gcs_path: str) -> set[str]:
    """Return the column names from the first row of a GCS NDJSON file."""
    try:
        result = subprocess.run(
            ["gsutil", "cat", gcs_path],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        print(f"  WARNING: timed out reading {gcs_path}", file=sys.stderr)
        return set()

    if result.returncode != 0:
        print(f"  WARNING: could not read {gcs_path}: {result.stderr.strip()}", file=sys.stderr)
        return set()

    first_line = result.stdout.strip().split("\n")[0]
    if not first_line:
        return set()
    try:
        row = json.loads(first_line)
        return set(row.keys())
    except json.JSONDecodeError:
        return set()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", default=None, help="GCS bucket name (overrides GCS_BUCKET env var)")
    parser.add_argument("--warn-only", action="store_true", help="Exit 0 even when metrics are missing")
    args = parser.parse_args()

    bucket = args.bucket or os.environ.get("GCS_BUCKET")
    if not bucket:
        print("ERROR: provide --bucket or set GCS_BUCKET", file=sys.stderr)
        sys.exit(2)

    # Step 1: collect all metric IDs per provider file
    print(f"Scanning provider files in {PROVIDERS_DIR} ...", flush=True)
    provider_metrics: dict[str, set[str]] = {}
    for provider_file in sorted(PROVIDER_TO_DAGS):
        path = PROVIDERS_DIR / provider_file
        if not path.exists():
            print(f"  WARNING: {provider_file} not found, skipping", file=sys.stderr)
            continue
        ids = extract_metric_ids(path)
        if ids:
            provider_metrics[provider_file] = ids

    all_frontend_metrics: set[str] = set()
    for ids in provider_metrics.values():
        all_frontend_metrics |= ids

    print(f"  {len(all_frontend_metrics)} unique metric IDs across {len(provider_metrics)} providers")

    # Step 2: collect column names from prod national files
    print(f"\nReading column names from gs://{bucket}/ ...", flush=True)
    national_files = list_national_files(bucket)
    if not national_files:
        print(
            "ERROR: no *_national_current.json files found in bucket. Check bucket name and credentials.",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"  Found {len(national_files)} national export files")
    prod_columns: set[str] = set()
    read_failures = 0
    for gcs_path in national_files:
        cols = get_columns(gcs_path)
        if not cols:
            read_failures += 1
        prod_columns |= cols

    if read_failures:
        print(
            f"  WARNING: {read_failures} file(s) could not be read — missing metrics may be under-reported.",
            file=sys.stderr,
        )
    print(f"  {len(prod_columns)} unique columns across all national files")

    # Step 3: find missing metrics
    missing_by_dag: dict[str, list[str]] = {}
    for provider_file, ids in sorted(provider_metrics.items()):
        for metric_id in sorted(ids):
            if metric_id not in prod_columns:
                for dag in get_dags_for_metric(provider_file, metric_id):
                    missing_by_dag.setdefault(dag, []).append(metric_id)

    # Deduplicate (a metric might appear in multiple providers)
    for dag in missing_by_dag:
        missing_by_dag[dag] = sorted(set(missing_by_dag[dag]))

    # Step 4: report
    print()
    if not missing_by_dag:
        print("OK: all frontend metric IDs are present in the prod export bucket.")
        sys.exit(0)

    total_missing = sum(len(v) for v in missing_by_dag.values())
    print(f"WARNING: {total_missing} metric ID(s) not found in prod export columns.\n")
    print("To repair, rerun the listed DAG workflow(s) against the production project:\n")
    for dag, metrics in sorted(missing_by_dag.items()):
        for m in metrics:
            print(f"  MISSING IN PROD ({dag}): {m}")

    print(
        "\nNote: a missing metric is expected when a new topic ships ahead of its first DAG run.\n"
        "It is only a regression when the metric existed in prod before this release.\n"
        "Verify against the previous release before treating this as a blocker."
    )

    sys.exit(0 if args.warn_only else 1)


if __name__ == "__main__":
    main()
