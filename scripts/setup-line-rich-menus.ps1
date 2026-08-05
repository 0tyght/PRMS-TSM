param(
    [string]$ProjectPath = "C:\xampp\htdocs\PRMS-TSM",
    [switch]$KeepPreviousMenus
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    $Line = Get-Content -LiteralPath $Path |
        Where-Object {
            $_ -match ("^\s*{0}\s*=" -f [regex]::Escape($Name))
        } |
        Select-Object -Last 1

    if ($null -eq $Line) {
        return ""
    }

    return (($Line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

function Set-DotEnvValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value
    )

    $Content = [System.IO.File]::ReadAllText(
        $Path,
        [System.Text.Encoding]::UTF8
    )

    $Pattern = "(?m)^\s*" + [regex]::Escape($Name) + "\s*=.*$"
    $Line = "$Name=$Value"

    if ([regex]::IsMatch($Content, $Pattern)) {
        $Content = [regex]::Replace(
            $Content,
            $Pattern,
            [System.Text.RegularExpressions.MatchEvaluator]{
                param($Match)
                return $Line
            },
            1
        )
    } else {
        if (-not $Content.EndsWith([Environment]::NewLine)) {
            $Content += [Environment]::NewLine
        }

        $Content += $Line + [Environment]::NewLine
    }

    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        $Utf8NoBom
    )
}

function Invoke-LineJson {
    param(
        [ValidateSet("GET", "POST", "DELETE")]
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null
    )

    $Arguments = @{
        Uri = $Uri
        Method = $Method
        Headers = @{
            Authorization = "Bearer $script:AccessToken"
        }
        TimeoutSec = 60
    }

    if ($null -ne $Body) {
        $JsonBody = (
            $Body |
            ConvertTo-Json -Depth 20 -Compress
        )

        # Windows PowerShell 5.1 may encode string request bodies with
        # the active ANSI code page. Send UTF-8 bytes explicitly so
        # LINE stores Thai label, displayText, and chatBarText correctly.
        $Arguments["ContentType"] = "application/json; charset=utf-8"
        $Arguments["Body"] = [System.Text.Encoding]::UTF8.GetBytes(
            $JsonBody
        )
    }

    try {
        return Invoke-RestMethod @Arguments
    } catch {
        $Detail = $_.Exception.Message

        if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) {
            $Detail = $_.ErrorDetails.Message
        }

        throw "LINE API ไม่สำเร็จ: $Method $Uri`n$Detail"
    }
}

function New-UriArea {
    param(
        [int]$X,
        [int]$Y,
        [int]$Width,
        [int]$Height,
        [string]$Label,
        [string]$Uri
    )

    return @{
        bounds = @{
            x = $X
            y = $Y
            width = $Width
            height = $Height
        }
        action = @{
            type = "uri"
            label = $Label
            uri = $Uri
        }
    }
}

function New-RichMenu {
    param(
        [string]$Name,
        [array]$Areas,
        [string]$ImagePath
    )

    Write-Host "กำลังสร้าง $Name ..."

    $Menu = Invoke-LineJson `
        -Method POST `
        -Uri "https://api.line.me/v2/bot/richmenu" `
        -Body @{
            size = @{
                width = 2500
                height = 1686
            }
            selected = $true
            name = $Name
            chatBarText = "เมนูบริการ"
            areas = $Areas
        }

    $RichMenuId = [string]$Menu.richMenuId

    if (-not $RichMenuId) {
        throw "LINE ไม่ส่ง richMenuId กลับมาสำหรับ $Name"
    }

    try {
        Invoke-WebRequest `
            -Uri "https://api-data.line.me/v2/bot/richmenu/$RichMenuId/content" `
            -Method Post `
            -Headers @{
                Authorization = "Bearer $script:AccessToken"
            } `
            -ContentType "image/png" `
            -InFile $ImagePath `
            -UseBasicParsing `
            -TimeoutSec 120 |
            Out-Null
    } catch {
        Invoke-LineJson `
            -Method DELETE `
            -Uri "https://api.line.me/v2/bot/richmenu/$RichMenuId" |
            Out-Null

        throw "อัปโหลดภาพของ $Name ไม่สำเร็จ: $($_.Exception.Message)"
    }

    Write-Host "สร้างสำเร็จ: $RichMenuId" -ForegroundColor Green
    return $RichMenuId
}

$RepoRoot = (
    Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop
).Path

$EnvPath = Join-Path $RepoRoot ".env"
$AssetPath = Join-Path $RepoRoot "apps\api\assets\rich-menu"

if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
    throw "ไม่พบไฟล์ .env"
}

$script:AccessToken = Get-DotEnvValue `
    -Path $EnvPath `
    -Name "LINE_CHANNEL_ACCESS_TOKEN"

if (-not $script:AccessToken) {
    throw "LINE_CHANNEL_ACCESS_TOKEN ยังว่างอยู่"
}

$LiffId = Get-DotEnvValue `
    -Path $EnvPath `
    -Name "LINE_LIFF_ID"

if (-not $LiffId) {
    throw "LINE_LIFF_ID ยังว่างอยู่"
}

$GuestImage = Join-Path $AssetPath "rich-menu-guest.png"
$OwnerImage = Join-Path $AssetPath "rich-menu-owner.png"
$ActionImage = Join-Path $AssetPath "rich-menu-action.png"

foreach ($Image in @($GuestImage, $OwnerImage, $ActionImage)) {
    if (-not (Test-Path -LiteralPath $Image -PathType Leaf)) {
        throw "ไม่พบภาพ Rich Menu: $Image"
    }

    if ((Get-Item -LiteralPath $Image).Length -gt 1MB) {
        throw "ภาพ Rich Menu ต้องมีขนาดไม่เกิน 1 MB: $Image"
    }
}

$LiffBase = "https://liff.line.me/$LiffId"

function Get-LiffUrl {
    param(
        [string]$View = "home",
        [string]$Section = "",
        [string]$Action = ""
    )

    $Pairs = @(
        "view=$([Uri]::EscapeDataString($View))"
    )

    if ($Section) {
        $Pairs += "section=$([Uri]::EscapeDataString($Section))"
    }

    if ($Action) {
        $Pairs += "action=$([Uri]::EscapeDataString($Action))"
    }

    return "$LiffBase`?$($Pairs -join '&')"
}

$TopY = 95
$CellWidth = 833
$LastWidth = 834
$TopHeight = 795
$BottomY = 890
$BottomHeight = 796

$GuestAreas = @(
    (New-UriArea 0 $TopY $CellWidth $TopHeight "ลงทะเบียนสัตว์" (Get-LiffUrl -View "register")),
    (New-UriArea $CellWidth $TopY $CellWidth $TopHeight "ติดตามคำขอ" (Get-LiffUrl -View "track")),
    (New-UriArea 1666 $TopY $LastWidth $TopHeight "เชื่อมทะเบียนเดิม" (Get-LiffUrl -View "account" -Section "profile")),
    (New-UriArea 0 $BottomY $CellWidth $BottomHeight "วิธีใช้งาน" (Get-LiffUrl -View "home")),
    (New-UriArea $CellWidth $BottomY $CellWidth $BottomHeight "ติดต่อเทศบาล" (Get-LiffUrl -View "home" -Section "contact")),
    (New-UriArea 1666 $BottomY $LastWidth $BottomHeight "เมนูหลัก" (Get-LiffUrl -View "home"))
)

$OwnerAreas = @(
    (New-UriArea 0 $TopY $CellWidth $TopHeight "สัตว์ของฉัน" (Get-LiffUrl -View "account" -Section "pets")),
    (New-UriArea $CellWidth $TopY $CellWidth $TopHeight "เพิ่มสัตว์" (Get-LiffUrl -View "register")),
    (New-UriArea 1666 $TopY $LastWidth $TopHeight "สุขภาพสัตว์" (Get-LiffUrl -View "account" -Action "vaccination")),
    (New-UriArea 0 $BottomY $CellWidth $BottomHeight "แจ้งสถานะสัตว์" (Get-LiffUrl -View "account" -Action "status")),
    (New-UriArea $CellWidth $BottomY $CellWidth $BottomHeight "คำขอของฉัน" (Get-LiffUrl -View "account" -Section "requests")),
    (New-UriArea 1666 $BottomY $LastWidth $BottomHeight "ข้อมูลเจ้าของ" (Get-LiffUrl -View "account" -Section "profile"))
)

$ActionAreas = @(
    (New-UriArea 0 $TopY $CellWidth $TopHeight "รายการต้องทำ" (Get-LiffUrl -View "account" -Section "attention")),
    (New-UriArea $CellWidth $TopY $CellWidth $TopHeight "สุขภาพสัตว์" (Get-LiffUrl -View "account" -Action "vaccination")),
    (New-UriArea 1666 $TopY $LastWidth $TopHeight "แจ้งสถานะสัตว์" (Get-LiffUrl -View "account" -Action "status")),
    (New-UriArea 0 $BottomY $CellWidth $BottomHeight "คำขอของฉัน" (Get-LiffUrl -View "account" -Section "requests")),
    (New-UriArea $CellWidth $BottomY $CellWidth $BottomHeight "ตำแหน่งบ้าน" (Get-LiffUrl -View "account" -Section "location")),
    (New-UriArea 1666 $BottomY $LastWidth $BottomHeight "ข้อมูลเจ้าของ" (Get-LiffUrl -View "account" -Section "profile"))
)

$MenuNames = @(
    "PRMS-TSM Guest LIFF First V6",
    "PRMS-TSM Owner LIFF First V6",
    "PRMS-TSM Action LIFF First V6"
)

$ObsoleteMenuNames = @(
    "PRMS-TSM Guest Dynamic V2",
    "PRMS-TSM Owner Dynamic V2",
    "PRMS-TSM Action Dynamic V2",
    "PRMS-TSM Guest Dynamic V3",
    "PRMS-TSM Owner Dynamic V3",
    "PRMS-TSM Action Dynamic V3",
    "PRMS-TSM Guest Native V4",
    "PRMS-TSM Owner Native V4",
    "PRMS-TSM Action Native V4",
    "PRMS-TSM Guest Native V5",
    "PRMS-TSM Owner Native V5",
    "PRMS-TSM Action Native V5",
    "PRMS-TSM Guest LIFF First V6",
    "PRMS-TSM Owner LIFF First V6",
    "PRMS-TSM Action LIFF First V6"
)

Write-Host "กำลังอ่านรายการ Rich Menu เดิม..."
$Existing = Invoke-LineJson `
    -Method GET `
    -Uri "https://api.line.me/v2/bot/richmenu/list"

$OldMenus = @($Existing.richmenus) | Where-Object {
    $ObsoleteMenuNames -contains [string]$_.name
}

# สร้างครบทั้งสามชุดก่อนเปลี่ยน Default เพื่อไม่ให้บริการเดิมหายเมื่อ API ขัดข้อง
$OwnerId = ""
$ActionId = ""
$GuestId = New-RichMenu `
    -Name $MenuNames[0] `
    -Areas $GuestAreas `
    -ImagePath $GuestImage

try {
    $OwnerId = New-RichMenu `
        -Name $MenuNames[1] `
        -Areas $OwnerAreas `
        -ImagePath $OwnerImage

    $ActionId = New-RichMenu `
        -Name $MenuNames[2] `
        -Areas $ActionAreas `
        -ImagePath $ActionImage
} catch {
    foreach ($CreatedId in @($GuestId, $OwnerId, $ActionId)) {
        if ($CreatedId) {
            try {
                Invoke-LineJson `
                    -Method DELETE `
                    -Uri "https://api.line.me/v2/bot/richmenu/$CreatedId" |
                    Out-Null
            } catch {
                Write-Warning "ลบ Rich Menu ที่สร้างค้างไว้ไม่สำเร็จ: $CreatedId"
            }
        }
    }
    throw
}

Write-Host "กำลังตั้งเมนูเริ่มต้น..."
Invoke-LineJson `
    -Method POST `
    -Uri "https://api.line.me/v2/bot/user/all/richmenu/$GuestId" |
    Out-Null

Set-DotEnvValue $EnvPath "LINE_RICH_MENU_GUEST_ID" $GuestId
Set-DotEnvValue $EnvPath "LINE_RICH_MENU_OWNER_ID" $OwnerId
Set-DotEnvValue $EnvPath "LINE_RICH_MENU_ACTION_ID" $ActionId

Write-Host ""
Write-Host "กำลังซิงก์ Rich Menu ให้บัญชี LINE จริงที่เชื่อมทะเบียนแล้ว..."
& node (Join-Path $RepoRoot "scripts\sync-line-rich-menus.mjs")

if ($LASTEXITCODE -ne 0) {
    Write-Warning "สร้างเมนูสำเร็จ แต่บางบัญชียังซิงก์ไม่ครบ ระบบจะลองใหม่เมื่อผู้ใช้ส่งข้อความหา Bot"
}

if (-not $KeepPreviousMenus) {
    Write-Host "กำลังลบ Rich Menu รุ่นเดิมหลังเปิดรุ่นใหม่สำเร็จ..."
    $NewIds = @($GuestId, $OwnerId, $ActionId)

    foreach ($Menu in $OldMenus) {
        if ($NewIds -notcontains [string]$Menu.richMenuId) {
            try {
                Write-Host "ลบรุ่นเดิม: $($Menu.name)"
                Invoke-LineJson `
                    -Method DELETE `
                    -Uri "https://api.line.me/v2/bot/richmenu/$($Menu.richMenuId)" |
                    Out-Null
            } catch {
                Write-Warning "ลบเมนูเดิมไม่สำเร็จ แต่เมนูใหม่ใช้งานได้แล้ว: $($Menu.richMenuId)"
            }
        }
    }
}

Write-Host ""
Write-Host "สร้าง LINE LIFF-first Rich Menu สำเร็จ" -ForegroundColor Green
Write-Host ""
Write-Host "Guest : $GuestId"
Write-Host "Owner : $OwnerId"
Write-Host "Action: $ActionId"
Write-Host ""
Write-Host "บันทึก ID ลง .env แล้ว"
Write-Host "ตั้ง Guest เป็น Default Rich Menu แล้ว"
Write-Host "ทุกปุ่มเปิด LIFF ไปยังหน้าที่เกี่ยวข้องโดยตรง และเมนูเปลี่ยนตามข้อมูลจริง"
