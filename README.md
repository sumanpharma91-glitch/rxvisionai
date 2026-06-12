# RxVision AI OCR Cleanup MVP

This update improves the browser OCR demo:

- Removes all sample placeholder field values.
- Leaves uncertain fields blank instead of exporting fake data.
- Adds OCR cleanup for common mistakes like `Lazenge` -> `Lozenge` and `IManth` -> `1 Month`.
- Adds a Smart Cleanup button.
- Keeps pharmacist verification warnings.

## Deploy
Upload the contents of this folder to Vercel, not the parent folder itself.

Required root files:

- index.html
- mvp.html
- styles.css
- script.js

Prototype only. Not for clinical use.
