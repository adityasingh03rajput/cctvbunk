package com.example.enrollmentapp

import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect
import android.os.Bundle
import android.util.Base64
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * CCTV capture mode — the "camera agent" for a tablet/phone mounted in a classroom.
 *
 * Loop: poll /api/cctv/next-capture → when a capture window is due, grab a frame,
 * detect all faces (FaceDetectionHelper, reused as-is), crop each with margin,
 * apply a cheap on-device quality pre-filter (min crop size), and upload the
 * full frame + crops to /api/cctv/submit-capture. Matching happens server-side.
 *
 * Completely separate from the enrollment flow — that code path is untouched.
 */
class CctvCaptureActivity : AppCompatActivity() {

    companion object {
        private const val POLL_INTERVAL_MS = 30_000L
        private const val MIN_CROP_PX = 20          // reject crops smaller than this — lowered for emulator testing
        private const val CROP_MARGIN = 0.25f       // bbox margin fraction
        private const val JPEG_QUALITY = 88
    }

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var infoText: TextView
    private lateinit var stopButton: Button

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var faceDetectionHelper: FaceDetectionHelper
    private lateinit var apiService: ApiService

    private var pollJob: Job? = null

    // One-shot frame grab: the analyzer normally drops frames; when a capture is
    // requested this deferred is completed with the next frame.
    @Volatile private var frameRequest: CompletableDeferred<Bitmap>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_cctv_capture)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        previewView = findViewById(R.id.cctvPreviewView)
        statusText  = findViewById(R.id.cctvStatusText)
        infoText    = findViewById(R.id.cctvInfoText)
        stopButton  = findViewById(R.id.cctvStopButton)

        apiService = ApiService(this)
        cameraExecutor = Executors.newSingleThreadExecutor()
        faceDetectionHelper = FaceDetectionHelper(
            context = this,
            onResults = { },
            onError = { msg -> runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() } }
        )

        stopButton.setOnClickListener { finish() }

        val creds = apiService.getCameraCredentials()
        if (creds == null) {
            promptForRegistration()
        } else {
            infoText.text = "Camera: ${creds.first}"
            startCamera()
            startPollLoop()
        }
    }

    // ── One-time camera registration (credentials from admin panel) ───────────

    private fun promptForRegistration() {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 24, 48, 0)
        }
        val idInput = EditText(this).apply { hint = "Camera ID" }
        val secretInput = EditText(this).apply { hint = "Camera Secret" }
        layout.addView(idInput)
        layout.addView(secretInput)

        AlertDialog.Builder(this)
            .setTitle("Register Camera")
            .setMessage("Enter the credentials generated in the admin panel (Cameras section).")
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton("Save") { _, _ ->
                val id = idInput.text.toString().trim()
                val secret = secretInput.text.toString().trim()
                if (id.isEmpty() || secret.isEmpty()) {
                    Toast.makeText(this, "Both fields are required", Toast.LENGTH_LONG).show()
                    finish()
                } else {
                    apiService.saveCameraCredentials(id, secret)
                    infoText.text = "Camera: $id"
                    startCamera()
                    startPollLoop()
                }
            }
            .setNegativeButton("Cancel") { _, _ -> finish() }
            .show()
    }

    // ── Camera (back camera — pointed at the classroom) ───────────────────────

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        val request = frameRequest
                        if (request != null && !request.isCompleted) {
                            try {
                                val bitmap = imageProxy.toBitmap()
                                val rotated = rotateBitmap(bitmap, imageProxy.imageInfo.rotationDegrees.toFloat())
                                request.complete(rotated)
                            } catch (e: Exception) {
                                request.completeExceptionally(e)
                            }
                        }
                        imageProxy.close()
                    }
                }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageAnalyzer
                )
            } catch (e: Exception) {
                Toast.makeText(this, "Camera initialization failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private suspend fun grabFrame(): Bitmap? {
        val deferred = CompletableDeferred<Bitmap>()
        frameRequest = deferred
        return try {
            kotlinx.coroutines.withTimeout(5000) { deferred.await() }
        } catch (e: Exception) {
            null
        } finally {
            frameRequest = null
        }
    }

    // ── Poll → capture → upload loop ──────────────────────────────────────────

    private fun startPollLoop() {
        pollJob?.cancel()
        pollJob = lifecycleScope.launch {
            while (true) {
                try {
                    statusText.text = "Polling for capture schedule..."
                    val task = apiService.pollNextCapture()
                    if (task != null && task.windowId.isNotEmpty()) {
                        statusText.text = "📸 Capture due: ${task.period} (room ${task.roomNumber})"
                        performCapture(task)
                    } else {
                        statusText.text = "Idle — no capture due"
                    }
                } catch (e: Exception) {
                    statusText.text = "Error: ${e.message}"
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private suspend fun performCapture(task: CaptureTask) {
        val frame = grabFrame()
        if (frame == null) {
            statusText.text = "⚠️ Failed to grab frame"
            return
        }

        statusText.text = "Detecting faces..."
        val result = faceDetectionHelper.detectFace(frame)
        val detections = result?.detections() ?: emptyList()

        val crops = mutableListOf<FaceCrop>()
        for (det in detections) {
            val bb = det.boundingBox()
            // Expand bbox by margin
            val mw = bb.width() * CROP_MARGIN
            val mh = bb.height() * CROP_MARGIN
            val rect = Rect(
                maxOf(0, (bb.left - mw).toInt()),
                maxOf(0, (bb.top - mh).toInt()),
                minOf(frame.width, (bb.right + mw).toInt()),
                minOf(frame.height, (bb.bottom + mh).toInt())
            )
            val w = rect.width()
            val h = rect.height()
            // Cheap quality pre-filter: don't upload unusable tiny crops
            if (w < MIN_CROP_PX || h < MIN_CROP_PX) continue

            val cropBmp = Bitmap.createBitmap(frame, rect.left, rect.top, w, h)
            crops.add(FaceCrop(bitmapToBase64(cropBmp), rect.left, rect.top, w, h))
        }

        statusText.text = "Uploading ${crops.size} face(s)..."
        val resp = apiService.submitCapture(task.windowId, bitmapToBase64(frame), crops)
        statusText.text = if (resp.success) {
            "✅ Uploaded ${crops.size} face(s) — ${resp.message.take(120)}"
        } else {
            "❌ Upload failed: ${resp.message.take(120)}"
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun bitmapToBase64(bmp: Bitmap): String {
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun rotateBitmap(bitmap: Bitmap, degrees: Float): Bitmap {
        if (degrees == 0f) return bitmap
        val matrix = Matrix()
        matrix.postRotate(degrees)
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    override fun onDestroy() {
        super.onDestroy()
        pollJob?.cancel()
        cameraExecutor.shutdown()
        faceDetectionHelper.close()
    }
}
