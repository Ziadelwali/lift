# Small pictures for the picture bar, thumbnails and tiles: img/ex/<id>/t.jpg, 200 px wide,
# made from the first photo (0.jpg). One-off; run again after adding exercises:
#   powershell -ExecutionPolicy Bypass -File tools\make-thumbs.ps1
# Uses Windows' own System.Drawing, no packages. The outputs are committed.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 78L
$n = 0
Get-ChildItem (Join-Path $root 'img\ex') -Directory | ForEach-Object {
  $src = Join-Path $_.FullName '0.jpg'
  if (-not (Test-Path $src)) { return }
  $img = [System.Drawing.Image]::FromFile($src)
  $w = 200; $h = [int][Math]::Round($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save((Join-Path $_.FullName 't.jpg'), $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose(); $n++
}
"$n thumbnails written"
