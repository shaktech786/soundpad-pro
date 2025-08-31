!macro preInit
  ; Check if application is already installed
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "UninstallString"
  ${If} $0 != ""
    ; Previous version found, prompt user
    MessageBox MB_YESNO|MB_ICONQUESTION "SoundPad Pro is already installed. Would you like to uninstall the previous version?" IDYES uninst
    Abort
    uninst:
      ; Run the uninstaller silently
      ExecWait '"$0" /S _?=$INSTDIR'
      Delete "$0"
      RMDir "$INSTDIR"
  ${EndIf}
!macroend

!macro customInstall
  ; Add registry entries for Windows Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "DisplayName" "SoundPad Pro"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "Publisher" "SoundPad Pro"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "DisplayIcon" "$INSTDIR\SoundPad Pro.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "UninstallString" "$INSTDIR\Uninstall SoundPad Pro.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}" "NoRepair" 1
  
  ; Create Start Menu shortcuts with uninstaller
  CreateDirectory "$SMPROGRAMS\SoundPad Pro"
  CreateShortcut "$SMPROGRAMS\SoundPad Pro\SoundPad Pro.lnk" "$INSTDIR\SoundPad Pro.exe"
  CreateShortcut "$SMPROGRAMS\SoundPad Pro\Uninstall SoundPad Pro.lnk" "$INSTDIR\Uninstall SoundPad Pro.exe"
!macroend

!macro customUnInstall
  ; Remove registry entries
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}"
  
  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\SoundPad Pro\SoundPad Pro.lnk"
  Delete "$SMPROGRAMS\SoundPad Pro\Uninstall SoundPad Pro.lnk"
  RMDir "$SMPROGRAMS\SoundPad Pro"
  
  ; Ask user about keeping settings
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to keep your sound mappings and settings for future use?" IDYES keep
    ; Delete app data if user chooses
    RMDir /r "$APPDATA\soundpad-pro"
  keep:
!macroend