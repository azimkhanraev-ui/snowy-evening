; Runs on uninstall. Updates also run the uninstaller, and must keep autostart.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SnowyEvening"
  ${endIf}
!macroend
