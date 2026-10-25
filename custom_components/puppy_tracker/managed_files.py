"""Content-addressed, private binary storage; metadata remains in the main store."""

from __future__ import annotations

import base64
import json
from hashlib import sha256
from io import BytesIO
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from typing import Any
import warnings

from PIL import Image, ImageOps
from homeassistant.core import HomeAssistant

MAX_UPLOAD_BYTES = 2_000_000
MAX_FILE_BYTES = 512_000
MAX_PDF_BYTES = 2_000_000
MAX_TOTAL_BYTES = 32_000_000
MAX_FILES = 256
FILE_ID = re.compile(r"^[a-f0-9]{64}$")


def validate_file_id(value: Any) -> str:
    if not isinstance(value, str) or not FILE_ID.fullmatch(value):
        raise ValueError("Invalid managed file ID")
    return value


def normalize_logo(content: bytes) -> bytes:
    """Decode only PNG/JPEG, cap pixels, flatten transparency and strip metadata."""
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Logo exceeds the 2 MB upload limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as original:
                if original.format not in ("PNG", "JPEG") or original.width * original.height > 16_000_000:
                    raise ValueError("Expected a PNG/JPEG of at most 16 million pixels")
                original.load()
                image = ImageOps.exif_transpose(original).convert("RGBA")
                image.thumbnail((1024, 1024))
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                for quality in (85, 70, 55):
                    output = BytesIO()
                    background.save(output, format="JPEG", quality=quality)
                    if output.tell() <= MAX_FILE_BYTES:
                        return output.getvalue()
    except (OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as err:
        raise ValueError("Invalid logo image") from err
    raise ValueError("Logo exceeds the stored image size limit")


def validate_manifest(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict) or len(value) > MAX_FILES:
        raise ValueError("Invalid managed file manifest")
    result = {}
    for file_id, metadata in value.items():
        validate_file_id(file_id)
        if not isinstance(metadata, dict) or set(metadata) != {"name", "content_type", "size"}:
            raise ValueError("Invalid managed file metadata")
        name = metadata["name"]
        size = metadata["size"]
        if not isinstance(name, str) or not name or len(name) > 100 or any(char in name for char in "/\\\r\n"):
            raise ValueError("Invalid display filename")
        if not isinstance(metadata["content_type"], str):
            raise ValueError("Invalid managed file type")
        limit = {"image/jpeg": MAX_FILE_BYTES, "application/pdf": MAX_PDF_BYTES, "application/json": MAX_FILE_BYTES}.get(metadata["content_type"], 0)
        if type(size) is not int or not 0 < size <= limit:
            raise ValueError("Unsupported managed file type or size")
        result[file_id] = dict(metadata)
    if sum(item["size"] for item in result.values()) > MAX_TOTAL_BYTES:
        raise ValueError("Managed files exceed the total size limit")
    return result


def validate_file_backup(manifest: Any, contents: Any) -> dict[str, bytes]:
    """Reject missing, extra, corrupted or unsafe blobs before changing anything."""
    files = validate_manifest(manifest)
    if not isinstance(contents, dict) or set(contents) != set(files):
        raise ValueError("Backup must contain exactly the referenced managed files")
    decoded = {}
    for file_id, encoded in contents.items():
        if not isinstance(encoded, str) or len(encoded) > ((files[file_id]["size"] + 2) // 3) * 4:
            raise ValueError("Invalid managed file content size")
        try:
            content = base64.b64decode(encoded, validate=True)
        except ValueError as err:
            raise ValueError("Invalid managed file encoding") from err
        if len(content) != files[file_id]["size"] or sha256(content).hexdigest() != file_id:
            raise ValueError("Managed file checksum mismatch")
        if files[file_id]["content_type"] == "application/pdf":
            validate_pdf(content)
            decoded[file_id] = content
            continue
        if files[file_id]["content_type"] == "application/json":
            validate_snapshot_file(content)
            decoded[file_id] = content
            continue
        if not content.startswith(b"\xff\xd8"):
            raise ValueError("Stored logo must be a JPEG")
        # Header checks are cheap enough for the synchronous preview validator.
        try:
            with Image.open(BytesIO(content)) as image:
                if image.format != "JPEG" or image.width > 1024 or image.height > 1024:
                    raise ValueError("Invalid stored image dimensions")
                image.verify()
        except (OSError, SyntaxError) as err:
            raise ValueError("Invalid stored image") from err
        decoded[file_id] = content
    return decoded


def validate_pdf(content: bytes) -> None:
    """Bound archive blobs; downloads are attachments, not embedded executable content."""
    if not content.startswith(b"%PDF-") or not content.rstrip().endswith(b"%%EOF") or len(content) > MAX_PDF_BYTES:
        raise ValueError("Invalid stored PDF")


def validate_snapshot_file(content: bytes) -> None:
    from .document_templates import validate_snapshot
    if len(content) > MAX_FILE_BYTES:
        raise ValueError("Document snapshot exceeds size limit")
    try:
        validate_snapshot(json.loads(content))
    except (UnicodeError, RecursionError) as err:
        raise ValueError("Invalid document snapshot") from err


class ManagedFiles:
    """Filesystem access always runs in the executor and never uses user paths."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.config_root = Path(hass.config.config_dir).resolve()
        self.root = self.config_root / "puppy_tracker" / "files"

    def _path(self, file_id: str) -> Path:
        validate_file_id(file_id)
        if self.root.resolve() != self.root or not self.root.resolve().is_relative_to(self.config_root):
            raise ValueError("Managed storage cannot point outside the config directory")
        path = self.root / file_id
        if path.is_symlink():
            raise ValueError("Managed files cannot be symlinks")
        return path

    def read(self, file_id: str) -> bytes:
        path = self._path(file_id)
        if path.stat().st_size > MAX_PDF_BYTES:
            raise ValueError("Managed file is too large")
        content = path.read_bytes()
        if sha256(content).hexdigest() != file_id:
            raise ValueError("Managed file checksum mismatch")
        return content

    def _write(self, file_id: str, content: bytes) -> None:
        if len(content) > MAX_PDF_BYTES or sha256(content).hexdigest() != file_id:
            raise ValueError("Invalid managed file content")
        if content.startswith(b"%PDF-"):
            validate_pdf(content)
        elif content.startswith(b"{"):
            validate_snapshot_file(content)
        else:
            if len(content) > MAX_FILE_BYTES:
                raise ValueError("Stored logo exceeds size limit")
            normalize_logo(content)
        path = self._path(file_id)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.root, 0o700)
        if path.exists():
            self.read(file_id)
            return
        temporary = None
        try:
            with NamedTemporaryFile(dir=self.root, delete=False) as stream:
                temporary = Path(stream.name)
                os.chmod(temporary, 0o600)
                stream.write(content)
            temporary.replace(path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    async def async_write(self, file_id: str, content: bytes) -> None:
        await self.hass.async_add_executor_job(self._write, file_id, content)

    async def async_read(self, file_id: str) -> bytes:
        return await self.hass.async_add_executor_job(self.read, file_id)

    async def async_export(self, manifest: dict) -> dict[str, str]:
        result = {}
        for file_id in validate_manifest(manifest):
            result[file_id] = base64.b64encode(await self.async_read(file_id)).decode("ascii")
        return result

    async def async_cleanup(self, keep: set[str]) -> None:
        def cleanup() -> None:
            self._path("0" * 64)
            if not self.root.exists():
                return
            for path in self.root.iterdir():
                if FILE_ID.fullmatch(path.name) and path.name not in keep and path.is_file() and not path.is_symlink():
                    path.unlink()
        await self.hass.async_add_executor_job(cleanup)
