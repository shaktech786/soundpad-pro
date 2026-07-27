; PRE-392: filename must stay in sync with scripts/fetch-obs-setup-binary.js's
; ASSET_NAME, main/obs-setup-binary-path.js's OBS_SETUP_BINARY_NAME, and the
; "obs-setup" destination folder .electron-builder.config.js's extraResources
; copies build/obs-setup into (resources/obs-setup once installed).
!define OBS_SETUP_RELATIVE_PATH "resources\obs-setup\prelive-obs-setup-windows-x64.exe"

!macro customInit
  ; Kill running instances of both the pre-rename (SoundPad Pro) and current
  ; (Prelive Deck) executable names before installing — PRE-385 renamed the
  ; product but upgraders' old processes may still be running under the old name.
  nsExec::ExecToLog 'taskkill /F /IM "SoundPad Pro.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Prelive Deck.exe"'
  Sleep 1000
!macroend

; Reproduces electron-builder's default finish page (see
; node_modules/app-builder-lib/templates/nsis/{common,assistedInstaller}.nsh)
; verbatim for the "launch app" checkbox, then repurposes the finish page's
; only other checkbox slot — MUI_FINISHPAGE_SHOWREADME — to optionally launch
; the bundled OBS Setup tool. MUI2's finish page supports exactly two
; checkboxes (MUI_FINISHPAGE_RUN and MUI_FINISHPAGE_SHOWREADME; see NSIS's
; Contrib/Modern UI 2/Pages/Finish.nsh), electron-builder already owns RUN for
; "launch the app", so SHOWREADME's _FUNCTION override is the only free hook
; for a second post-install action.
;
; Runs non-elevated via ${StdUtils.ExecShellAsUser} — the same de-elevation
; primitive electron-builder's own StartApp uses below — because the tool
; opens a browser to authorize the user's OBS connection, which must not run
; as the elevated installer process.
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\${OBS_SETUP_RELATIVE_PATH}"
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Set up my OBS (recommended)"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION RunObsSetup

  Function RunObsSetup
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${OBS_SETUP_RELATIVE_PATH}" "open" ""
  FunctionEnd

  !insertmacro MUI_PAGE_FINISH
!macroend
