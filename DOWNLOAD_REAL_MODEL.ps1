$url = "https://storage.googleapis.com/tfhub-lite-models/google/lite-model/mobilenet_v3_large_100_224/feature_vector/5/default/1.tflite"
$letsBunkPath = "d:\bunk bssid\android\app\src\main\assets\iris_embedding_int8.tflite"
$enrollmentPath = "d:\bunk bssid\enrollment-app\app\src\main\assets\iris_embedding_int8.tflite"

Write-Host "🚀 Downloading official MobileNetV3 Feature Vector TFLite Model from Google Servers..." -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $url -OutFile $letsBunkPath -UseBasicParsing
    Write-Host "✅ Successfully downloaded to LetsBunk assets folder." -ForegroundColor Green
    
    Copy-Item -Path $letsBunkPath -Destination $enrollmentPath -Force
    Write-Host "✅ Successfully copied to Enrollment App assets folder." -ForegroundColor Green
    
    Write-Host "`n🎉 The REAL model has been successfully installed. You can now build the APKs!" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to download model: $_" -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
