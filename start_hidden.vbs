'' ==============================================================================
'' ESPERANZA KIOSK - HIDDEN LAUNCHER
'' This VBScript launches the batch file with minimized terminal windows
'' ==============================================================================

Set WshShell = CreateObject("WScript.Shell")

'' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

'' Path to the batch file
batchFile = scriptDir & "\start_kiosk_final.bat"

'' Run the batch file with window style = 0 (completely hidden)
'' Window styles: 0=hidden, 1=normal, 2=minimized, 7=minimized no focus
'' Performance issues resolved by redirecting Python output in batch file
WshShell.Run """" & batchFile & """", 0, False

Set WshShell = Nothing
