$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing,System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public class NativeQA { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr info); [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l); }
'@
$out=Join-Path $PWD 'qa-results';New-Item -ItemType Directory -Force $out | Out-Null
$fixture=Join-Path $env:RUNNER_TEMP 'vv-ui-fixture';New-Item -ItemType Directory -Force $fixture | Out-Null
$results=@()
foreach($lang in @('en','zh')) { foreach($action in @('directory','save')) { foreach($mode in @('cancel','select')) {
$id="$lang-$action-$mode";$stdout=Join-Path $out "$id.json";$stderr=Join-Path $out "$id.stderr.txt"
$path=if($action -eq 'directory'){$fixture}else{Join-Path $fixture "$id.mp4"}
$p=Start-Process node -ArgumentList @('qa/launch.mjs',$action,$lang,$path) -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$processHandle=$p.Handle
try {
$deadline=(Get-Date).AddSeconds(30);$win=$null
while((Get-Date) -lt $deadline -and !$win) {
$desc=@(Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $p.Id} | Select-Object -ExpandProperty ProcessId)
$all=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $all){if($desc -contains $w.Current.ProcessId -and $w.Current.ClassName -eq '#32770'){$win=$w;break}}
if(!$win){Start-Sleep -Milliseconds 200}
}
if(!$win){ $all | ForEach-Object { "$($_.Current.ProcessId) | $($_.Current.ClassName) | $($_.Current.Name)" } | Set-Content (Join-Path $out "$id.windows.txt"); throw "No native dialog: $id" }
Start-Sleep -Milliseconds 500
$nodes=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$title=$win.Current.Name;$names=@($title)+@($nodes | ForEach-Object {$_.Current.Name})
$expected=if($action -eq 'save'){if($lang -eq 'en'){'Save As'}else{'另存为'}}else{if($lang -eq 'en'){'Select video cache directory'}else{'选择视频缓存目录'}}
if(!($names -contains $expected)){throw "Missing localized label $expected in $($names -join '|')"}
$names | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out "$id.labels.json")
$r=$win.Current.BoundingRectangle;$bmp=New-Object Drawing.Bitmap([int]$r.Width,[int]$r.Height);$g=[Drawing.Graphics]::FromImage($bmp);$g.CopyFromScreen([int]$r.X,[int]$r.Y,0,0,$bmp.Size);$bmp.Save((Join-Path $out "$id.png"));$g.Dispose();$bmp.Dispose()
if($mode -eq 'cancel'){[NativeQA]::SendMessage([IntPtr]$win.Current.NativeWindowHandle,0x111,[IntPtr]2,[IntPtr]0)|Out-Null}
elseif($action -eq 'directory'){[NativeQA]::SendMessage([IntPtr]$win.Current.NativeWindowHandle,0x111,[IntPtr]1,[IntPtr]0)|Out-Null}
else {
$button=$nodes | Where-Object {$_.Current.Name -eq 'Save'} | Select-Object -First 1
if(!$button){throw 'Save button not found'}
$b=$button.Current.BoundingRectangle
[NativeQA]::SetCursorPos([int]($b.X+$b.Width/2),[int]($b.Y+$b.Height/2))|Out-Null
[NativeQA]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[NativeQA]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
if(!$p.WaitForExit(15000)){throw "Dialog did not return: $id"}
$v=Get-Content -Raw $stdout | ConvertFrom-Json
if($p.ExitCode -ne 0){throw "Native failure: $(Get-Content -Raw $stderr)"}
if($mode -eq 'cancel'){if(!$v.canceled){throw 'Cancel semantics changed'}}else{if($v.canceled -or $v.path -ne $path){throw "Selection mismatch: $($v.path) expected $path"}}
$results+=@{case=$id;result='pass';title=$title;expectedLabel=$expected;response=$v}
$results|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 (Join-Path $out 'results.json')
} finally { if(!$p.HasExited){Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $p.Id} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue};$p.Kill()} }
}}}
# Exercise actual Node AbortSignal path in each locale.
foreach($lang in @('en','zh')){
$s=& node qa/launch.mjs directory $lang $fixture abort
$v=$s|ConvertFrom-Json
if($v.code -ne 'ABORT_ERR' -or $v.name -ne 'AbortError'){throw "Abort semantics changed: $s"}
$results+=@{case="$lang-abort";result='pass';response=$v}
}
$results|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 (Join-Path $out 'results.json')
Get-FileHash lib/native-ui.js,lib/windows-ui.ps1,lib/ui-locale.js | Format-Table | Out-File (Join-Path $out 'source-hashes.txt')
Write-Output 'PASS native EN/ZH directory/save select/cancel and AbortSignal'
