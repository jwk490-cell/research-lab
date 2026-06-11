# ════════════════════════════════════════════════════════════
# Joy and July Research Hub — 일일 배포 스크립트
#   최신 대시보드 HTML을 site/ 로 복사하면서 공통 테마(hub-theme.css)를
#   주입하고 git push 한다.  사용:  powershell -File publish.ps1  [-NoPush]
# ════════════════════════════════════════════════════════════
param([switch]$NoPush)

$site = "C:\Users\smily\.claude\수급 html\site"
$src  = "C:\Users\smily\.claude\수급 html"

function Publish-One($sourcePath, $target, $class) {
    if (-not $sourcePath -or -not (Test-Path $sourcePath)) {
        Write-Host "  skip  $target (원본 없음)"; return
    }
    $html = Get-Content -Raw -Encoding UTF8 $sourcePath
    if ($html -notmatch 'hub-theme\.css') {
        $html = $html -replace '<html lang="ko">', ('<html lang="ko" class="' + $class + '">')
        $html = $html.Replace('</head>', '<link rel="stylesheet" href="hub-theme.css"></head>')
    }
    Set-Content -Path (Join-Path $site $target) -Value $html -Encoding UTF8
    Write-Host "  done  $target  <-  $(Split-Path $sourcePath -Leaf)"
}

Write-Host "=== 최신 원본 탐색 ==="
$supply = Get-ChildItem $src -Filter "KRX 신고가*.html" -File |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
$export = Get-ChildItem $src -Filter "주요품목 수출 대시보드*.html" -File |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host "=== 배포 ==="
Publish-One $supply.FullName                                        "supply.html"     "ht-supply"
Publish-One "C:\Users\smily\.claude\sector-report\sector-report.html" "sector.html"   "ht-sector"
Publish-One $export.FullName                                        "export.html"     "ht-export"
Publish-One "$src\이격도.html"                                       "disparity.html"  "ht-disp"
Publish-One "$src\osc_dashboard.html"                               "oscillator.html" "ht-osc"

if (-not $NoPush) {
    $st = git -C $site status --porcelain
    if ($st) {
        git -C $site add -A
        git -C $site commit -m ("daily publish " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
        git -C $site push
        Write-Host "=== push 완료 ==="
    } else {
        Write-Host "=== 변경 없음 — push 생략 ==="
    }
}
