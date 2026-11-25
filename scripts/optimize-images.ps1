# Run manually from the repository root. Requires ImageMagick with WebP support.
$ErrorActionPreference = 'Stop'
$imageJobs = @(
  @{ Source='Tikpan TV Modernised Logo.png'; Name='tikpan-logo.webp'; Width=640; Lossless=$true },
  @{ Source='Tikpan TV Modernised Logo.png'; Name='favicon.png'; Width=64 },
  @{ Source='Tikpan TV Building.png'; Name='tikpan-building.webp'; Quality=92 },
  @{ Source='Tikpan TV Building.png'; Name='tikpan-building-960.webp'; Width=960; Quality=92 },
  @{ Source='Tikpan TV Building.png'; Name='tikpan-building-640.webp'; Width=640; Quality=92 },
  @{ Source='Tikpan TV News Studio.png'; Name='tikpan-studio.webp'; Quality=92 },
  @{ Source='Tikpan TV News Studio.png'; Name='tikpan-studio-960.webp'; Width=960; Quality=92 },
  @{ Source='assets/Tikpan Radio Logo.png'; Name='radio-dock.webp'; Width=128; Lossless=$true },
  @{ Source='assets/Tikpan Radio Logo.png'; Name='radio-panel.webp'; Width=512; Lossless=$true },
  @{ Source='assets/Tikpan Radio Logo.png'; Name='radio-logo.webp'; Lossless=$true },
  @{ Source='assets/tikpan satellite.png'; Name='satellite.webp'; Width=1024; Lossless=$true },
  @{ Source='assets/Tikpan Radio/parallax/radio.png'; Name='radio-label.webp'; Lossless=$true },
  @{ Source='assets/Tikpan Radio/parallax/microphone.png'; Name='radio-microphone.webp'; Lossless=$true },
  @{ Source='assets/Tikpan Radio/parallax/signal.png'; Name='radio-signal.webp'; Lossless=$true },
  @{ Source='assets/Tikpan Radio/parallax/wordmark.png'; Name='radio-wordmark.webp'; Lossless=$true }
)
New-Item -ItemType Directory -Path assets/optimized -Force | Out-Null
foreach ($imageJob in $imageJobs) {
  $imageArgs = @($imageJob.Source, '-strip')
  if ($imageJob.Width) { $imageArgs += @('-resize', "$($imageJob.Width)x") }
  if ($imageJob.Lossless) { $imageArgs += @('-define', 'webp:lossless=true') }
  if ($imageJob.Quality) { $imageArgs += @('-quality', $imageJob.Quality) }
  $imageArgs += Join-Path assets/optimized $imageJob.Name
  & magick @imageArgs
  if ($LASTEXITCODE -ne 0) { throw "Image optimization failed: $($imageJob.Source)" }
}
