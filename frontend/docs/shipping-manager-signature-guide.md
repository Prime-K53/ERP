# Shipping Manager Signature Guide

## Scope
This guide covers dispatch-to-delivery proof flow in `Shipping Manager` with desktop-compatible signature capture.

## Proof Of Delivery (POD) Source Of Truth
- Authoritative POD is stored on `DeliveryNote.proofOfDelivery`.
- `Shipment.proofOfDelivery` remains as legacy-compatible copy only.

## Dispatch Flow
1. Open `Shipping Manager` and dispatch a pending delivery note.
2. Shipment is written atomically with linked delivery note status moved to `In Transit`.
3. Transport metadata is synced: carrier, driver name, vehicle number, tracking number, ETA.

## Delivery Seal Flow
1. Open an active shipment and click `Seal Proof of Delivery`.
2. Enter recipient name (required), optional phone, timestamp, and remarks.
3. Capture signature using either:
   - `Draw`: pointer-based canvas (mouse/pen/touch) with high-DPI export.
   - `Upload`: image upload (`png`, `jpg/jpeg`, `webp`, max 5MB).
4. Finalize delivery (requires recipient name + signature).
5. Shipment and linked delivery note are atomically updated to `Delivered`.

## Document Rendering Coverage
- PDF preview/download (`PrimeDocument`): receiver details, timestamp, signature image, GPS, remarks.
- Print preview (`documentMapper`/`DocumentDispatcher`): same POD metadata and signature image.

## Desktop Compatibility Notes
- Signature pad is pointer-event based for desktop mouse/pen support.
- Upload fallback supports desktop-only flows where drawing is not preferred.
- `Notify Client` uses `sms:` deep link first, then clipboard fallback.

## Data Storage Fields
POD includes:
- `receivedBy`
- `signatureDataUrl`
- `signatureInputMode` (`Draw` or `Upload`)
- `timestamp`
- optional `recipientPhone`
- optional `notes` / `remarks`
- optional `locationStamp` (`lat`, `lng`)

## Troubleshooting
- Geolocation denied/unavailable:
  - Enter coordinates manually; save still works.
- Finalize button disabled:
  - Confirm recipient name is filled and signature is drawn/uploaded.
- Blank signature after drawing:
  - Use `Clear Signature`, redraw with a continuous stroke, then finalize.
- Upload rejected:
  - Use supported image type (`png/jpg/webp`) and keep size <= 5MB.
