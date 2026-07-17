Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("d:\intern\intern_lakshya.apk")
$entry = $zip.Entries | Where-Object { $_.FullName -eq "assets/index.android.bundle" }
if ($entry) {
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, "d:\intern\index.android.bundle", $true)
    Write-Host "Success"
} else {
    Write-Host "Entry not found"
}
$zip.Dispose()
