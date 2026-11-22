; electron-builder keeps a 100+ MB copy of the installer for differential auto-updates.
; This app never goes online, so the copy would only waste the user's disk.
!macro customInstall
  !ifdef APP_INSTALLER_STORE_FILE
    Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    ; RMDir without /r removes the folder only when it is empty.
    RMDir "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
  !endif
!macroend

; Runs on uninstall. Updates also run the uninstaller, and must keep autostart.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SnowyEvening"
  ${endIf}
!macroend
