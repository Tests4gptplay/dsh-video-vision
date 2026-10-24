$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$action = $env:DSH_CV_ACTION
$videos = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyVideos)
if (-not $videos) { $videos = Join-Path $env:USERPROFILE 'Videos' }
if ($action -eq 'reveal') {
  Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $env:DSH_CV_PATH + '"')
  @{ path = $env:DSH_CV_PATH } | ConvertTo-Json -Compress
  exit
}
if ($action -ne 'save' -and $action -ne 'directory') { throw "Unknown file action: $action" }
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$dialog = $null
try {
  $owner.ShowInTaskbar = $false
  $owner.StartPosition = 'CenterScreen'
  $owner.Size = New-Object System.Drawing.Size(1, 1)
  $owner.Opacity = 0
  $owner.TopMost = $true
  $owner.Show()
  $owner.Activate()
  if ($action -eq 'directory') {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = '选择视频缓存目录'
    $dialog.SelectedPath = $env:DSH_CV_PATH
    $dialog.ShowNewFolderButton = $true
  } elseif ($action -eq 'save') {
    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = '另存为'
    $dialog.FileName = $env:DSH_CV_NAME
    $dialog.InitialDirectory = $videos
    $dialog.RestoreDirectory = $true
    $dialog.OverwritePrompt = $true
    $dialog.AddExtension = $true
    $extension = [IO.Path]::GetExtension($env:DSH_CV_NAME).TrimStart('.')
    if ($extension) {
      $dialog.DefaultExt = $extension
      $dialog.Filter = "$($extension.ToUpper()) (*.$extension)|*.$extension|All files (*.*)|*.*"
    }
  }
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    $path = if ($action -eq 'directory') { $dialog.SelectedPath } else { $dialog.FileName }
    @{ path = $path; canceled = $false } | ConvertTo-Json -Compress
  } else {
    @{ canceled = $true } | ConvertTo-Json -Compress
  }
} finally {
  if ($dialog) { $dialog.Dispose() }
  $owner.Close()
  $owner.Dispose()
}
