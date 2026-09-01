[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$script:CurrentOperation = '初始化脚本'

function Write-Section {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    Write-Host ''
    Write-Host ('  {0}' -f $Title) -ForegroundColor Cyan
    Write-Host ('  {0}' -f ('-' * 66)) -ForegroundColor DarkGray
}

function Wait-BeforeExit {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Failed
    )

    if (-not $Failed) {
        Write-Host ''
        Write-Host '  窗口将在 2 秒后关闭...' -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
        return
    }

    Write-Host ''
    Write-Host '  请按任意键结束脚本。' -ForegroundColor Yellow

    try {
        if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
            [void][Console]::ReadKey($true)
        }
        else {
            [void](Read-Host)
        }
    }
    catch {
        [void](Read-Host)
    }
}

function Test-IsReparsePoint {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Item
    )

    return (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
}

function Test-ContainsGitKeep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $match = Get-ChildItem -LiteralPath $DirectoryPath -Force -Recurse -File -Filter '.gitkeep' |
        Select-Object -First 1

    return ($null -ne $match)
}

function Move-DirectoryContentPreservingGitKeep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,

        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    if (-not (Test-Path -LiteralPath $DestinationPath)) {
        [void](New-Item -ItemType Directory -Path $DestinationPath)
    }

    $children = @(Get-ChildItem -LiteralPath $SourcePath -Force)

    foreach ($child in $children) {
        if ($child.Name -ieq '.gitkeep') {
            continue
        }

        $childDestination = Join-Path $DestinationPath $child.Name
        $isRegularDirectory = $child.PSIsContainer -and -not (Test-IsReparsePoint -Item $child)

        if ($isRegularDirectory -and (Test-ContainsGitKeep -DirectoryPath $child.FullName)) {
            Move-DirectoryContentPreservingGitKeep `
                -SourcePath $child.FullName `
                -DestinationPath $childDestination
        }
        else {
            Move-Item -LiteralPath $child.FullName -Destination $childDestination -Force
        }
    }
}

function Move-ArchiveEntry {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Entry,

        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    $isRegularDirectory = $Entry.PSIsContainer -and -not (Test-IsReparsePoint -Item $Entry)

    if ($isRegularDirectory -and (Test-ContainsGitKeep -DirectoryPath $Entry.FullName)) {
        Move-DirectoryContentPreservingGitKeep `
            -SourcePath $Entry.FullName `
            -DestinationPath $DestinationPath
    }
    else {
        Move-Item -LiteralPath $Entry.FullName -Destination $DestinationPath -Force
    }
}

try {
    try {
        $Host.UI.RawUI.WindowTitle = 'LexueOJGrab - 内容归档'
    }
    catch {
        # 某些非交互式宿主不支持设置窗口标题，不影响归档功能。
    }

    $projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
    $archiveRoot = Join-Path $projectRoot '_Archived'
    $archiveGroups = @(
        [PSCustomObject]@{
            Name = 'Questions'
            Source = Join-Path $projectRoot 'Questions'
            Destination = Join-Path $archiveRoot 'Questions'
            Entries = @()
        },
        [PSCustomObject]@{
            Name = 'Sources'
            Source = Join-Path $projectRoot 'Sources'
            Destination = Join-Path $archiveRoot 'Sources'
            Entries = @()
        }
    )

    Write-Host ''
    Write-Host ('  {0}' -f ('=' * 66)) -ForegroundColor DarkCyan
    Write-Host '                    LexueOJGrab 内容归档工具' -ForegroundColor Cyan
    Write-Host ('  {0}' -f ('=' * 66)) -ForegroundColor DarkCyan
    Write-Host '  将 Questions 和 Sources 中的内容移动到 _Archived。'
    Write-Host '  同名目标会被完整替换；任何层级的 .gitkeep 都会保留原位。' -ForegroundColor Yellow

    $totalCount = 0
    foreach ($group in $archiveGroups) {
        $script:CurrentOperation = '检查来源目录：{0}' -f $group.Source

        if (-not (Test-Path -LiteralPath $group.Source -PathType Container)) {
            throw '找不到来源目录：{0}' -f $group.Source
        }

        $group.Entries = @(
            Get-ChildItem -LiteralPath $group.Source -Force |
                Where-Object { $_.Name -ine '.gitkeep' }
        )
        $totalCount += $group.Entries.Count
    }

    Write-Section -Title '执行摘要'
    foreach ($group in $archiveGroups) {
        Write-Host ('  {0,-10} {1,4} 项  ->  _Archived\{0}' -f $group.Name, $group.Entries.Count)
    }
    Write-Host ''
    Write-Host ('  共计：{0} 个顶层项目' -f $totalCount) -ForegroundColor White

    while ($true) {
        $response = Read-Host '  按 Enter 开始归档，或输入 Q 取消'

        if ([string]::IsNullOrWhiteSpace($response)) {
            break
        }

        if ($response.Trim() -ieq 'Q') {
            Write-Host ''
            Write-Host '  已取消，未执行任何归档操作。' -ForegroundColor Yellow
            Wait-BeforeExit -Failed $false
            exit 0
        }

        Write-Host '  输入无效：请直接按 Enter，或输入 Q 取消。' -ForegroundColor Yellow
    }

    $script:CurrentOperation = '创建归档目录'
    if (-not (Test-Path -LiteralPath $archiveRoot)) {
        [void](New-Item -ItemType Directory -Path $archiveRoot)
    }

    foreach ($group in $archiveGroups) {
        if (-not (Test-Path -LiteralPath $group.Destination)) {
            [void](New-Item -ItemType Directory -Path $group.Destination)
        }
    }

    Write-Section -Title '归档进度'
    $processedCount = 0
    $replacedCount = 0

    foreach ($group in $archiveGroups) {
        foreach ($entry in $group.Entries) {
            $processedCount++
            $destinationPath = Join-Path $group.Destination $entry.Name
            $relativeDestination = '_Archived\{0}\{1}' -f $group.Name, $entry.Name
            $script:CurrentOperation = '处理 {0}' -f $entry.FullName

            if (Test-Path -LiteralPath $destinationPath) {
                Write-Host ('  [{0}/{1}] [覆盖] {2}' -f $processedCount, $totalCount, $relativeDestination) `
                    -ForegroundColor Yellow
                $script:CurrentOperation = '删除旧的归档项：{0}' -f $destinationPath
                Remove-Item -LiteralPath $destinationPath -Recurse -Force
                $replacedCount++
            }
            else {
                Write-Host ('  [{0}/{1}] [移动] {2}' -f $processedCount, $totalCount, $relativeDestination) `
                    -ForegroundColor Gray
            }

            $script:CurrentOperation = '移动到归档目录：{0}' -f $entry.FullName
            Move-ArchiveEntry -Entry $entry -DestinationPath $destinationPath
        }
    }

    Write-Section -Title '归档完成'
    Write-Host ('  已处理：{0} 项' -f $processedCount) -ForegroundColor Green
    Write-Host ('  其中覆盖替换：{0} 项' -f $replacedCount) -ForegroundColor $(
        if ($replacedCount -gt 0) { 'Yellow' } else { 'Green' }
    )
    Write-Host '  所有 .gitkeep 均保留在原位置。' -ForegroundColor Green

    Wait-BeforeExit -Failed $false
    exit 0
}
catch {
    Write-Host ''
    Write-Host ('  {0}' -f ('=' * 66)) -ForegroundColor DarkRed
    Write-Host '  归档失败' -ForegroundColor Red
    Write-Host ('  {0}' -f ('=' * 66)) -ForegroundColor DarkRed
    Write-Host ('  失败操作：{0}' -f $script:CurrentOperation) -ForegroundColor Yellow
    Write-Host ('  错误原因：{0}' -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
    Write-Host '  提示：错误发生前已成功移动的内容不会自动回滚，请检查来源和归档目录。' `
        -ForegroundColor Yellow

    Wait-BeforeExit -Failed $true
    exit 1
}
