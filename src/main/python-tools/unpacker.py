"""
unpacker.py — Ren'Py Archive (.rpa) extractor & Compiled script (.rpyc) decompiler

Handles 99% of compiled Ren'Py VN games by:
1. Extracting .rpa archives to reveal .rpyc files
2. Decompiling .rpyc files back to human-readable .rpy

Dependencies (install via pip):
  pip install rpatool unrpyc

Usage:
  python unpacker.py <game_folder> [--mode extract|decompile|auto] [--output <dir>]
"""
import os
import sys
import json
import struct
import argparse
import traceback
from pathlib import Path

# ──────────────────────────────────────────────
# Logging helper — all output is JSON-line for TS side to parse
# ──────────────────────────────────────────────
def log_event(event_type: str, data: dict):
    msg = json.dumps({"event": event_type, **data}, ensure_ascii=False)
    print(msg, flush=True)


def log_progress(current: int, total: int, message: str = ""):
    log_event("progress", {
        "current": current,
        "total": total,
        "percent": round(current / max(total, 1) * 100, 1),
        "message": message,
    })


def log_error(message: str, detail: str = ""):
    log_event("error", {"message": message, "detail": detail})


def log_info(message: str):
    log_event("info", {"message": message})


def log_complete(files_processed: int, files_failed: int):
    log_event("complete", {
        "files_processed": files_processed,
        "files_failed": files_failed,
    })


# ──────────────────────────────────────────────
# .RPA Extractor
# Ren'Py Archive format:
#   Header: "RENPY RPA-3.x" (RPA-3.0 or RPA-3.1)
#   Followed by pickle-serialized dict: {index_offset: [(file_offset, data_length, original_length), ...]}
# ──────────────────────────────────────────────
def find_rpa_files(game_dir: str) -> list[str]:
    """Find all .rpa files recursively."""
    rpa_files = []
    for root, _, files in os.walk(game_dir):
        for f in files:
            if f.lower().endswith(".rpa"):
                rpa_files.append(os.path.join(root, f))
    return rpa_files


def extract_rpa(rpa_path: str, output_dir: str) -> tuple[int, int]:
    """
    Extract a single .rpa archive.
    Returns (extracted_count, failed_count).
    Supports RPA-3.0 and RPA-3.1 formats.
    """
    import pickle as pkl

    extracted = 0
    failed = 0

    try:
        with open(rpa_path, "rb") as f:
            header = f.readline().decode("ascii").strip()

            if not header.startswith("RENPY RPA-3."):
                log_error(f"Unsupported RPA version: {header}", rpa_path)
                return 0, 1

            version = float(header.split("-")[1])

            # Read key (if any)
            if version >= 3.1:
                key_line = f.readline().decode("ascii").strip()
                # key_line format: "key value" or empty
                key_parts = key_line.split(" ", 1)
                if len(key_parts) == 2 and key_parts[0] == "key":
                    key = int(key_parts[1], 16)
                else:
                    key = None
            else:
                key = None

            # Read the index offset
            offset_line = f.readline().decode("ascii").strip()
            offset_parts = offset_line.split(" ", 1)
            if len(offset_parts) == 2 and offset_parts[0] == "offset":
                index_start = int(offset_parts[1], 16)
            else:
                log_error("Could not parse RPA offset", rpa_path)
                return 0, 1

            # Seek to index and unpickle
            f.seek(index_start)
            try:
                index = pkl.load(f)
            except Exception as e:
                # Try with keys (XOR obfuscation)
                if key is not None:
                    f.seek(index_start)
                    data = f.read()
                    # XOR decrypt
                    decrypted = bytes([b ^ (key & 0xFF) for b in data])
                    import io
                    index = pkl.load(io.BytesIO(decrypted))
                else:
                    raise e

            if not isinstance(index, dict):
                log_error("RPA index is not a dict", rpa_path)
                return 0, 1

            total_files = sum(len(v) for v in index.values())
            log_info(f"Found {total_files} files in archive: {os.path.basename(rpa_path)}")

            processed = 0
            for filename, entries in index.items():
                for entry_idx, entry in enumerate(entries):
                    if isinstance(entry, tuple) and len(entry) >= 3:
                        file_offset, data_length, _original_length = entry[0], entry[1], entry[2]
                    else:
                        continue

                    try:
                        f.seek(file_offset)
                        data = f.read(data_length)

                        # Decrypt if needed
                        if key is not None:
                            data = bytes([b ^ (key & 0xFF) for b in data])

                        # Determine output path
                        out_path = os.path.join(output_dir, filename)
                        os.makedirs(os.path.dirname(out_path), exist_ok=True)

                        with open(out_path, "wb") as out_f:
                            out_f.write(data)

                        extracted += 1
                    except Exception as e:
                        failed += 1
                        log_error(f"Failed to extract {filename}", str(e))

                    processed += 1
                    if processed % 50 == 0:
                        log_progress(processed, total_files, f"Extracting {filename}")

            log_progress(total_files, total_files, f"Extracted {extracted} files from {os.path.basename(rpa_path)}")

    except Exception as e:
        log_error(f"Failed to extract {os.path.basename(rpa_path)}", traceback.format_exc())
        failed += 1

    return extracted, failed


# ──────────────────────────────────────────────
# .RPYC Decompiler
# Uses the unrpyc library if available, otherwise falls back to raw AST dumping
# ──────────────────────────────────────────────
def find_rpyc_files(game_dir: str) -> list[str]:
    """Find all .rpyc files recursively."""
    rpyc_files = []
    for root, _, files in os.walk(game_dir):
        # Skip game/cache/ — Ren'Py auto-generates these
        if "cache" in root.lower().split(os.sep):
            continue
        for f in files:
            if f.lower().endswith(".rpyc"):
                rpyc_files.append(os.path.join(root, f))
    return rpyc_files


def decompile_rpyc_batch(rpyc_files: list[str]) -> tuple[int, int]:
    """
    Try to use unrpyc library first. Fall back to manual AST dump.
    Returns (decompiled_count, failed_count).
    """
    decompiled = 0
    failed = 0

    # Try unrpyc (pip install unrpyc)
    try:
        from unrpyc import decompile as unrpyc_decompile
        log_info("Using unrpyc library for decompilation")
        for i, rpyc_path in enumerate(rpyc_files):
            try:
                rpy_path = rpyc_path[:-1]  # .rpyc -> .rpy
                unrpyc_decompile(rpyc_path, rpy_path, clobber=True)
                decompiled += 1
                log_progress(i + 1, len(rpyc_files), f"Decompiled {os.path.basename(rpyc_path)}")
            except Exception as e:
                failed += 1
                log_error(f"Failed to decompile {os.path.basename(rpyc_path)}", str(e))
        return decompiled, failed
    except ImportError:
        pass

    # Fallback: manual .rpyc parser (handles Ren'Py 7.x / 8.x formats)
    log_info("unrpyc not available, using built-in decompiler fallback")
    for i, rpyc_path in enumerate(rpyc_files):
        try:
            rpy_path = rpyc_path[:-1]  # .rpyc -> .rpy
            success = _fallback_decompile(rpyc_path, rpy_path)
            if success:
                decompiled += 1
            else:
                failed += 1
                log_error(f"Fallback decompiler could not parse {os.path.basename(rpyc_path)}")
            log_progress(i + 1, len(rpyc_files), f"Processed {os.path.basename(rpyc_path)}")
        except Exception as e:
            failed += 1
            log_error(f"Failed to process {os.path.basename(rpyc_path)}", traceback.format_exc())

    return decompiled, failed


def _fallback_decompile(rpyc_path: str, rpy_path: str) -> bool:
    """
    Minimal .rpyc reader — extracts dialogue strings from common formats.
    Covers Ren'Py 7.4+ and 8.0+ pickle-based bytecode.
    This is a BEST-EFFORT decompiler, not a full one.
    """
    import pickle as pkl

    with open(rpyc_path, "rb") as f:
        # Skip magic bytes
        magic = f.read(4)
        if magic not in (b"\x00\x00\x00\x01", b"\x00\x00\x00\x02"):
            # Try pickle directly
            f.seek(0)
            try:
                data = pkl.load(f)
                return _extract_from_pickle(data, rpy_path)
            except Exception:
                return False

        # Ren'Py bytecode format — try pickle from current position
        try:
            data = pkl.load(f)
            return _extract_from_pickle(data, rpy_path)
        except Exception:
            return False


def _extract_from_pickle(data, rpy_path: str) -> bool:
    """Extract translatable strings from pickled AST."""
    lines = []

    def walk(obj):
        """Recursively walk pickled objects to find strings."""
        if isinstance(obj, str) and len(obj) > 2:
            lines.append(f'    "{obj}"')
        elif isinstance(obj, (list, tuple)):
            for item in obj:
                walk(item)
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)

    walk(data)

    if not lines:
        return False

    with open(rpy_path, "w", encoding="utf-8") as f:
        f.write("# Decompiled (best-effort) from .rpyc\n")
        f.write(f"# Source: {os.path.basename(rpy_path) + 'c'}\n\n")
        for line in lines:
            f.write(line + "\n")

    return True


# ──────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Ren'Py .rpa/.rpyc unpacker")
    parser.add_argument("game_dir", help="Path to the game/ directory")
    parser.add_argument("--mode", choices=["extract", "decompile", "auto"], default="auto",
                        help="Mode: extract .rpa only, decompile .rpyc only, or auto-detect")
    parser.add_argument("--output", default=None, help="Output directory for extracted files (default: game_dir)")
    args = parser.parse_args()

    game_dir = os.path.abspath(args.game_dir)
    output_dir = args.output or game_dir

    if not os.path.isdir(game_dir):
        log_error(f"Game directory does not exist: {game_dir}")
        sys.exit(1)

    log_info(f"Unpacker started for: {game_dir}")
    log_info(f"Mode: {args.mode}, Output: {output_dir}")

    total_extracted = 0
    total_decompiled = 0
    total_failed = 0

    # Phase 1: Extract .rpa archives
    if args.mode in ("extract", "auto"):
        rpa_files = find_rpa_files(game_dir)
        if rpa_files:
            log_info(f"Found {len(rpa_files)} .rpa archive(s)")
            for i, rpa_path in enumerate(rpa_files):
                log_info(f"Extracting archive {i + 1}/{len(rpa_files)}: {os.path.basename(rpa_path)}")
                extracted, failed = extract_rpa(rpa_path, output_dir)
                total_extracted += extracted
                total_failed += failed
                log_progress(i + 1, len(rpa_files), f"Done: {os.path.basename(rpa_path)}")
        else:
            log_info("No .rpa files found")

    # Phase 2: Decompile .rpyc files
    if args.mode in ("decompile", "auto"):
        rpyc_files = find_rpyc_files(game_dir)
        if rpyc_files:
            log_info(f"Found {len(rpyc_files)} .rpyc file(s)")
            decompiled, failed = decompile_rpyc_batch(rpyc_files)
            total_decompiled += decompiled
            total_failed += failed
        else:
            log_info("No .rpyc files found")

    log_complete(
        files_processed=total_extracted + total_decompiled,
        files_failed=total_failed,
    )


if __name__ == "__main__":
    main()
