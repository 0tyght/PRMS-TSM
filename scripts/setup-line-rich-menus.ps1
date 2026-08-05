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
        $Arguments["ContentType"] = "application/json"
        $Arguments["Body"] = (
            $Body |
            ConvertTo-Json -Depth 20 -Compress
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

function New-UriAction {
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

function New-MessageAction {
    param(
        [int]$X,
        [int]$Y,
        [int]$Width,
        [int]$Height,
        [string]$Label,
        [string]$Text
    )

    return @{
        bounds = @{
            x = $X
            y = $Y
            width = $Width
            height = $Height
        }
        action = @{
            type = "message"
            label = $Label
            text = $Text
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

$LiffId = Get-DotEnvValue `
    -Path $EnvPath `
    -Name "LINE_LIFF_ID"

if (-not $script:AccessToken) {
    throw "LINE_CHANNEL_ACCESS_TOKEN ยังว่างอยู่"
}

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
$TopY = 95
$CellWidth = 833
$LastWidth = 834
$TopHeight = 795
$BottomY = 890
$BottomHeight = 796

function Liff-Url {
    param([string]$Query)
    return "$LiffBase`?$Query"
}

$GuestAreas = @(
    (New-UriAction 0 $TopY $CellWidth $TopHeight "ลงทะเบียนสัตว์" (Liff-Url "view=register")),
    (New-UriAction $CellWidth $TopY $CellWidth $TopHeight "ติดตามคำขอ" (Liff-Url "view=track")),
    (New-UriAction 1666 $TopY $LastWidth $TopHeight "เชื่อมทะเบียน" (Liff-Url "view=account")),
    (New-UriAction 0 $BottomY $CellWidth $BottomHeight "ข้อมูลบริการ" (Liff-Url "view=home")),
    (New-MessageAction $CellWidth $BottomY $CellWidth $BottomHeight "ติดต่อเทศบาล" "ติดต่อเทศบาล"),
    (New-MessageAction 1666 $BottomY $LastWidth $BottomHeight "เมนูช่วยเหลือ" "เมนู")
)

$OwnerAreas = @(
    (New-UriAction 0 $TopY $CellWidth $TopHeight "สัตว์ของฉัน" (Liff-Url "view=account&section=pets")),
    (New-UriAction $CellWidth $TopY $CellWidth $TopHeight "เพิ่มสัตว์" (Liff-Url "view=register")),
    (New-UriAction 1666 $TopY $LastWidth $TopHeight "แจ้งวัคซีน" (Liff-Url "view=account&action=vaccination")),
    (New-UriAction 0 $BottomY $CellWidth $BottomHeight "แจ้งทำหมัน" (Liff-Url "view=account&action=sterilization")),
    (New-UriAction $CellWidth $BottomY $CellWidth $BottomHeight "แจ้งสถานะ" (Liff-Url "view=account&action=status")),
    (New-UriAction 1666 $BottomY $LastWidth $BottomHeight "ตำแหน่งบ้าน" (Liff-Url "view=account&section=location"))
)

$ActionAreas = @(
    (New-UriAction 0 $TopY $CellWidth $TopHeight "สถานะคำขอ" (Liff-Url "view=account&section=attention")),
    (New-UriAction $CellWidth $TopY $CellWidth $TopHeight "วัคซีนถึงกำหนด" (Liff-Url "view=account&action=vaccination")),
    (New-UriAction 1666 $TopY $LastWidth $TopHeight "แจ้งสัตว์สูญหาย" (Liff-Url "view=account&action=status")),
    (New-UriAction 0 $BottomY $CellWidth $BottomHeight "คำขอของฉัน" (Liff-Url "view=account&section=requests")),
    (New-UriAction $CellWidth $BottomY $CellWidth $BottomHeight "ตำแหน่งบ้าน" (Liff-Url "view=account&section=location")),
    (New-UriAction 1666 $BottomY $LastWidth $BottomHeight "ข้อมูลของฉัน" (Liff-Url "view=account"))
)

$MenuNames = @(
    "PRMS-TSM Guest Dynamic V2",
    "PRMS-TSM Owner Dynamic V2",
    "PRMS-TSM Action Dynamic V2"
)

if (-not $KeepPreviousMenus) {
    Write-Host "กำลังตรวจ Rich Menu รุ่นเดิม..."

    try {
        Invoke-LineJson `
            -Method DELETE `
            -Uri "https://api.line.me/v2/bot/user/all/richmenu" |
            Out-Null
    } catch {
        Write-Host "ยังไม่มี Default Rich Menu เดิม หรือไม่จำเป็นต้องยกเลิก"
    }

    $Existing = Invoke-LineJson `
        -Method GET `
        -Uri "https://api.line.me/v2/bot/richmenu/list"

    foreach ($Menu in @($Existing.richmenus)) {
        if ($MenuNames -contains [string]$Menu.name) {
            Write-Host "ลบรุ่นเดิม: $($Menu.name)"
            Invoke-LineJson `
                -Method DELETE `
                -Uri "https://api.line.me/v2/bot/richmenu/$($Menu.richMenuId)" |
                Out-Null
        }
    }
}

$GuestId = New-RichMenu `
    -Name $MenuNames[0] `
    -Areas $GuestAreas `
    -ImagePath $GuestImage

$OwnerId = New-RichMenu `
    -Name $MenuNames[1] `
    -Areas $OwnerAreas `
    -ImagePath $OwnerImage

$ActionId = New-RichMenu `
    -Name $MenuNames[2] `
    -Areas $ActionAreas `
    -ImagePath $ActionImage

Write-Host "กำลังตั้งเมนูเริ่มต้น..."
Invoke-LineJson `
    -Method POST `
    -Uri "https://api.line.me/v2/bot/user/all/richmenu/$GuestId" |
    Out-Null

Set-DotEnvValue $EnvPath "LINE_RICH_MENU_GUEST_ID" $GuestId
Set-DotEnvValue $EnvPath "LINE_RICH_MENU_OWNER_ID" $OwnerId
Set-DotEnvValue $EnvPath "LINE_RICH_MENU_ACTION_ID" $ActionId

Write-Host ""
Write-Host "กำลังซิงก์ Rich Menu ให้บัญชี LINE ที่เชื่อมทะเบียนแล้ว..."
& node (Join-Path $RepoRoot "scripts\sync-line-rich-menus.mjs")

if ($LASTEXITCODE -ne 0) {
    Write-Warning "สร้างเมนูสำเร็จ แต่บางบัญชียังซิงก์ไม่ครบ ระบบจะลองใหม่เมื่อผู้ใช้เปิด LIFF หรือส่งข้อความหา Bot"
}

Write-Host ""
Write-Host "สร้าง Dynamic Rich Menu สำเร็จ" -ForegroundColor Green
Write-Host ""
Write-Host "Guest : $GuestId"
Write-Host "Owner : $OwnerId"
Write-Host "Action: $ActionId"
Write-Host ""
Write-Host "บันทึก ID ลง .env แล้ว"
Write-Host "ตั้ง Guest เป็น Default Rich Menu แล้ว"
Write-Host ""
Write-Host "ให้รีสตาร์ตเฉพาะ API เพื่อโหลด Rich Menu ID โดยคง Tunnel เดิมไว้"
Write-Host "ดูคำสั่งที่ตัวติดตั้งแสดงหลังทำงานเสร็จ"
Write-Host ""
Write-Host "เมื่อผู้ใช้เปิด LIFF หรือส่งข้อความหา Bot"
Write-Host "ระบบจะเลือก Guest / Owner / Action จากข้อมูลจริงของผู้ใช้นั้น"
