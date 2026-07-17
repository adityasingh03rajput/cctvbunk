package com.example.enrollmentapp

import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var progressText: TextView
    private lateinit var takeDataButton: Button

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var faceDetectionHelper: FaceDetectionHelper
    private lateinit var faceEmbeddingHelper: FaceEmbeddingHelper

    private val capturedEmbeddings = mutableListOf<FloatArray>()
    private val maxFrames = 10
    private var isProcessing = false
    private var frameCount = 0

    // Best full frame (largest detected face = closest/sharpest) kept for the
    // CCTV reference photo — uploaded server-side to build the 512D embedding.
    private var bestFrameBitmap: Bitmap? = null
    private var bestFrameFaceArea = 0f

    /**
     * When false the camera preview runs but NO embedding capture happens —
     * the student can freely adjust their face position.
     * Flips to true only when the student taps "Take Data".
     */
    private var readyToCapture = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_camera)

        previewView    = findViewById(R.id.previewView)
        statusText     = findViewById(R.id.statusText)
        progressText   = findViewById(R.id.progressText)
        takeDataButton = findViewById(R.id.takeDataButton)

        cameraExecutor = Executors.newSingleThreadExecutor()

        faceDetectionHelper = FaceDetectionHelper(
            context   = this,
            onResults = { },
            onError   = { error ->
                runOnUiThread { Toast.makeText(this, error, Toast.LENGTH_SHORT).show() }
            }
        )
        faceEmbeddingHelper = FaceEmbeddingHelper(this)

        // ── Take Data button ──────────────────────────────────────────────────
        takeDataButton.setOnClickListener {
            readyToCapture = true
            takeDataButton.visibility = View.GONE
            statusText.text  = "Capturing facial data... Keep your face steady"
            progressText.text = "Frames: 0/$maxFrames"
        }

        startCamera()
    }

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
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy -> processImage(imageProxy) }
                }

            val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalyzer)
            } catch (e: Exception) {
                Toast.makeText(this, "Camera initialization failed", Toast.LENGTH_SHORT).show()
            }

        }, ContextCompat.getMainExecutor(this))
    }

    private fun processImage(imageProxy: ImageProxy) {
        // While waiting for the student to tap "Take Data", just show the preview
        if (!readyToCapture) {
            imageProxy.close()
            return
        }

        if (isProcessing || capturedEmbeddings.size >= maxFrames) {
            imageProxy.close()
            return
        }

        isProcessing = true
        frameCount++

        val bitmap        = imageProxy.toBitmap()
        val rotatedBitmap = rotateBitmap(bitmap, imageProxy.imageInfo.rotationDegrees.toFloat())

        val detectionResult = faceDetectionHelper.detectFace(rotatedBitmap)

        if (detectionResult != null && detectionResult.detections().isNotEmpty()) {
            val detection   = detectionResult.detections()[0]
            val boundingBox = detection.boundingBox()

            val faceBitmap = cropFace(rotatedBitmap, boundingBox)
            val embedding  = faceEmbeddingHelper.extractEmbedding(faceBitmap)

            if (embedding != null) {
                capturedEmbeddings.add(embedding)
                // Track the best frame (largest face area) for the CCTV reference photo
                val faceArea = boundingBox.width() * boundingBox.height()
                if (faceArea > bestFrameFaceArea) {
                    bestFrameFaceArea = faceArea
                    bestFrameBitmap = rotatedBitmap.copy(rotatedBitmap.config ?: Bitmap.Config.ARGB_8888, false)
                }
                runOnUiThread {
                    progressText.text = "Frames: ${capturedEmbeddings.size}/$maxFrames"
                    statusText.text   = "Capturing... Keep your face steady"
                }
                if (capturedEmbeddings.size >= maxFrames) finishCapture()
            } else {
                runOnUiThread { statusText.text = "Processing face..." }
            }
        } else {
            runOnUiThread {
                statusText.text = "No face detected. Position your face in the oval"
            }
        }

        isProcessing = false
        imageProxy.close()
    }

    private fun cropFace(bitmap: Bitmap, boundingBox: android.graphics.RectF): Bitmap {
        val left   = maxOf(0, boundingBox.left.toInt())
        val top    = maxOf(0, boundingBox.top.toInt())
        val width  = minOf(bitmap.width  - left, boundingBox.width().toInt())
        val height = minOf(bitmap.height - top,  boundingBox.height().toInt())
        return Bitmap.createBitmap(bitmap, left, top, width, height)
    }

    private fun rotateBitmap(bitmap: Bitmap, degrees: Float): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(degrees)
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun finishCapture() {
        runOnUiThread {
            statusText.text   = "Processing complete!"
            progressText.text = "Captured $maxFrames frames"
        }

        val averageEmbedding = calculateAverageEmbedding(capturedEmbeddings)
        android.util.Log.d("EnrollDebug", "finishCapture: embedding size=${averageEmbedding.size}, first=${averageEmbedding[0]}")

        // Persist the best frame to cache — too large for an Intent extra.
        var bestFramePath: String? = null
        bestFrameBitmap?.let { bmp ->
            try {
                val file = java.io.File(cacheDir, "cctv_ref_${System.currentTimeMillis()}.jpg")
                java.io.FileOutputStream(file).use { out ->
                    bmp.compress(Bitmap.CompressFormat.JPEG, 90, out)
                }
                bestFramePath = file.absolutePath
                android.util.Log.d("EnrollDebug", "finishCapture: best frame saved to $bestFramePath")
            } catch (e: Exception) {
                android.util.Log.e("EnrollDebug", "finishCapture: failed to save best frame", e)
            }
        }

        val resultIntent = android.content.Intent()
        resultIntent.putExtra("face_embedding", averageEmbedding)
        resultIntent.putExtra("best_frame_path", bestFramePath)
        setResult(RESULT_OK, resultIntent)
        android.util.Log.d("EnrollDebug", "finishCapture: setResult RESULT_OK done, calling finish()")

        finish()
    }

    private fun calculateAverageEmbedding(embeddings: List<FloatArray>): FloatArray {
        val size    = embeddings[0].size
        val average = FloatArray(size)
        for (i in 0 until size) {
            var sum = 0f
            for (e in embeddings) sum += e[i]
            average[i] = sum / embeddings.size
        }
        val norm = kotlin.math.sqrt(average.sumOf { (it * it).toDouble() }).toFloat()
        for (i in average.indices) average[i] /= norm
        return average
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        faceDetectionHelper.close()
        faceEmbeddingHelper.close()
    }
}

@androidx.camera.core.ExperimentalGetImage
fun ImageProxy.toBitmap(): Bitmap {
    val image  = this.image ?: throw IllegalStateException("Image is null")
    val planes = image.planes
    val yBuffer = planes[0].buffer
    val uBuffer = planes[1].buffer
    val vBuffer = planes[2].buffer

    val ySize = yBuffer.remaining()
    val uSize = uBuffer.remaining()
    val vSize = vBuffer.remaining()

    val nv21 = ByteArray(ySize + uSize + vSize)
    yBuffer.get(nv21, 0, ySize)
    vBuffer.get(nv21, ySize, vSize)
    uBuffer.get(nv21, ySize + vSize, uSize)

    val yuvImage = android.graphics.YuvImage(nv21, android.graphics.ImageFormat.NV21, width, height, null)
    val out = java.io.ByteArrayOutputStream()
    yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), 100, out)
    val imageBytes = out.toByteArray()
    return android.graphics.BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
}
