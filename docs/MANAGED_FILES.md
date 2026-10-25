# Managed Files

## Upload a Report Logo

Open **Settings -> Devices & services -> Puppy Tracker -> Configure ->
Breeder information**. Select a PNG/JPEG with **Upload logo** and save.
The upload limit is 2 MB and 16 million pixels.

Reopen the form to see the saved logo preview. A new upload replaces the old
image. **Remove uploaded logo** removes only the managed image; the optional
local logo path remains available. Choose either uploading or removing, not
both. If saving fails, the previous logo stays active. Select the upload again
before retrying, because Home Assistant consumes temporary uploaded files.

An uploaded logo has priority over the local path. An unavailable image falls
back to that path, then to the Puppy Tracker integration icon. Turning Logo off in the Report
card excludes every logo and skips loading them.

## Storage and Recovery

Managed images live under `/config/puppy_tracker/files/`, not in `www` or
Home Assistant's `.storage`. They are converted to white-backed JPEGs with a
maximum side of 1024 pixels and a maximum stored size of 512 KB. Original EXIF
and other image metadata are not carried into the normalized upload.

Full Puppy Tracker backups, including the backup-to-file action, embed the
managed image bytes in backup format **v7**. A full replacement restores the
image and its reference together. Existing v4/v5/v6 backups remain readable.
Litter/puppy imports and merge-as-new transfers do not replace the destination
installation's breeder logo. Partial exports do not contain branding files.
Keep full backups private: they also contain owner/contact information.

A legacy `/local/...` image remains an externally managed file. Only its path
is stored; back up the actual `www` file separately with Home Assistant.

## Scope

The same private storage also retains generated contract PDFs and their JSON
template/data snapshots. Only admins can download or remove those documents
through the document API; they are never exposed through the logo URL. Full v7
backups carry the complete archive. See [Document templates](DOCUMENT_TEMPLATES.md).

Uploading pup photos or arbitrary dossier PDFs, a general file library, and
attachment inclusion in puppy dossier reports are not yet available. Those
additions need their own linking, authorization and deletion rules.
