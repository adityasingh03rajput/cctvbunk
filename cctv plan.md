Here's the integration plan, with the accuracy fix from the last message baked in as a first-class design decision, not an afterthought.

## Core design decision this plan hinges on

Your enrollment app's 192D MobileFaceNet stays exactly as-is for its current job (close-range 1:1 verification at check-in). For CCTV, we do **not** reuse that model or run embedding on-device at all. The phone/tablet only does detection + cropping; a stronger model on the server does the actual embedding + matching. Two different jobs, two different tools — this is the change that makes classroom-distance matching viable instead of guesswork.

This means **enrollment needs to happen twice per student, automatically, from one capture**: once producing the existing 192D embedding (check-in), once producing a new higher-quality embedding for CCTV matching. You won't touch the check-in flow at all.

---

## Architecture

```
[Classroom Camera/Tablet]  --detect+crop+bbox-->  [server.js]  --raw crop-->  [Embedding Service]
     (enrollment-app,                                  |                    (ArcFace, Python)
      new "CCTV mode")                                 |<--embedding vector--
                                                         |
                                                    match + gate
                                                         |
                    ┌────────────────────────────────────┼────────────────────────────┐
                    ▼                                    ▼                            ▼
            high confidence                       medium confidence              low confidence
            → auto PeriodAttendance          → Review Queue (admin panel)      → discard
```

---

## Phase 1 — Server: new schemas

`server.js` additions:

- **`Camera`** — as planned before (`cameraId`, `apiSecret`, `roomNumber`, `isActive`, `lastSeenAt`).
- **`CaptureWindow`** — random-snap scheduling per session (as planned before), unchanged.
- **`FaceMatchReview`** (new) — every match below the auto-confirm threshold lands here:
  ```
  { cameraId, roomNumber, semester, branch, period, date,
    snapshotUrl,        // full frame, Cloudinary
    faceCropUrl,        // just the matched crop, for the reviewer's quick glance
    bbox,               // {x,y,w,h} for overlay rendering in admin panel
    candidates: [{ enrollmentNo, name, similarity }],  // top-3
    status: 'pending' | 'confirmed' | 'rejected',
    reviewedBy, reviewedAt }
  ```
- **`StudentManagement`** gets one new field: `faceEmbeddingCctv: [Number]` (ArcFace, 512D) — additive, doesn't touch the existing `faceEmbedding` (192D) used at check-in.

---

## Phase 2 — Embedding service (new small component)

A minimal Python FastAPI service (or a Node process using `onnxruntime-node` if you'd rather stay single-language — your call, functionally equivalent):

- One endpoint: `POST /embed` → `{ image_base64 }` → `{ embedding: [512 floats], quality_score }`
- Model: InsightFace **buffalo_l** (ArcFace/ResNet50), CPU inference is fine at this volume (a handful of crops every few minutes per classroom, not video-rate).
- `quality_score` = simple heuristic (face size in pixels, detector confidence, blur variance) — this is your **quality gate**, computed once here so both enrollment and CCTV matching share the same bar.
- `server.js` calls this over HTTP internally; it's not exposed publicly.

---

## Phase 3 — Enrollment app: minimal, additive change

Your existing enrollment flow (`MainActivity` → `CameraActivity` → 10-frame average → 192D embedding → `POST /api/enrollment`) **stays untouched**.

One addition to `CameraActivity.kt`: alongside computing the 192D embedding, also keep the **best single frame** (highest liveness/quality frame already selected during capture) as a JPEG, and send it in the same save action:

- New `ApiService.kt` method: `uploadEnrollmentPhoto(enrollmentNo, imageBase64)` → `POST /api/enrollment/reference-photo`
- Server endpoint receives it, calls the embedding service once, stores the result in `faceEmbeddingCctv`.
- Net effect: one tap in the existing enrollment flow now populates *both* embeddings. No new screen, no new mode for this part.

---

## Phase 4 — Enrollment app: CCTV capture mode (new, separate screen)

This is the "camera agent" — runs on a tablet/phone mounted in the classroom.

New files in the same APK:
- `CctvCaptureActivity.kt` — reuses `FaceDetectionHelper` as-is (it already returns all detected faces). For each detection: crop the bbox with some margin, run a cheap **on-device quality pre-filter** (crop size in pixels, e.g. reject anything under ~80×80 before even uploading — no point sending unusable data), then upload crops.
- `ApiService.kt` additions:
  - `registerCamera(cameraId, secret)` — one-time setup, stores credentials locally (`SecureStorage.js`'s Kotlin equivalent / `EncryptedSharedPreferences`).
  - `pollNextCapture(cameraId)` — polls the schedule.
  - `submitCapture(windowId, fullFrameBase64, crops: [{bbox, imageBase64}])` — sends **both** the full frame (for admin audit/overlay) and the individual crops (for matching).
- A foreground `Service` (persistent notification, since this needs to run continuously while mounted) driving the poll → capture → upload loop.
- `MainActivity.kt` gets one added menu item: "Switch to Camera Mode" → launches `CctvCaptureActivity`, separate from the student-enrollment browsing screen.

One APK, two independent modes, existing enrollment code path never executed differently.

---

## Phase 5 — Server: ingestion + matching + gating logic

New endpoint `POST /api/cctv/submit-capture` (behind the `cameraAuth` middleware from before):

1. Store full frame → Cloudinary → `snapshotUrl`.
2. For each crop: call the embedding service → get `embedding` + `quality_score`.
3. If `quality_score` below floor → discard silently (log count only, don't attempt matching garbage).
4. Else: cosine-match against `faceEmbeddingCctv` pool for that `semester`+`branch` (function from before, just pointed at the new field/dimension).
5. Apply **two thresholds**, not one:
   - `similarity ≥ 0.75` → high confidence → feed into `CaptureWindow.completedCaptures` as before, K-of-N auto-confirms into `PeriodAttendance` via `syncAttendanceRecord`, exactly like your manual-mark flow.
   - `0.55 ≤ similarity < 0.75` → write to `FaceMatchReview` with top-3 candidates, `status: 'pending'` — a human decides.
   - `< 0.55` → discard.

This mirrors the accept/reject pattern you already have for random-ring — same instinct, same UX shape, so it'll feel familiar in the admin panel.

---

## Phase 6 — Admin panel

Two new sidebar sections, following the existing `classrooms` section's pattern:

- **"Cameras"** — CRUD (add/edit/deactivate), one-time secret reveal modal, online/offline status (`lastSeenAt` freshness), which room each is mapped to.
- **"CCTV Review"** — queue of `FaceMatchReview` pending items: shows `snapshotUrl` with the `bbox` drawn as an overlay rectangle (canvas draw, cheap), the cropped face next to it, and the top-3 candidate names/scores as buttons — one click confirms (writes to `PeriodAttendance` same as manual-mark, tagged `verificationType: 'cctv'`) or rejects (marks reviewed, no attendance effect).

---

## Phase 7 — Rollout order (don't skip this)

1. Wire Phase 1–3 first (schemas + embedding service + enrollment photo capture) and **backfill** `faceEmbeddingCctv` for your existing enrolled students by re-running their existing photos through the embedding service, if you still have any stored reference images — otherwise they'll need a one-time re-capture.
2. Deploy **one camera in one classroom** first. Run it for a few real class periods with auto-confirm threshold set artificially high (so almost everything lands in the review queue).
3. Look at the review queue by hand for a week: are true matches clustering above 0.75? Are false matches creeping above 0.55? Tune both thresholds against your actual camera/room/lighting before trusting any auto-confirm — this number will differ from mine, it depends on your specific cameras and room geometry.
4. Only then expand to more classrooms.
