import React from 'react'

export type TemplateMappingStatus = 'applied' | 'needs-calibration' | null

interface TemplateMappingNoticeProps {
  status: TemplateMappingStatus
  templateName?: string | null
  onCalibrate?: () => void
  onManualMap?: () => void
}

/**
 * Feedback shown right after a board template is applied, telling the user
 * whether its default button mapping actually took effect. Shared between
 * BoardBuilder (layout editing) and the onboarding wizard so the wording and
 * gating stay in one place.
 */
export function TemplateMappingNotice({ status, templateName, onCalibrate, onManualMap }: TemplateMappingNoticeProps) {
  if (!status) return null

  if (status === 'applied') {
    return (
      <div
        role="status"
        className="bg-green-900/40 border border-green-700 text-green-200 text-sm rounded-lg px-4 py-3"
      >
        {templateName ? `"${templateName}"` : 'This template'} shipped a default button mapping for your
        connected Haute42 — pads are ready to use without a manual remap.
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="bg-amber-900/40 border border-amber-700 text-amber-200 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
    >
      <span>
        {templateName ? `"${templateName}"` : 'This template'} has a default mapping, but we can&apos;t confirm
        it matches your controller yet. Buttons are left unmapped until you calibrate or map them manually.
      </span>
      <div className="flex gap-2 shrink-0">
        {onCalibrate && (
          <button
            type="button"
            onClick={onCalibrate}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-md transition-colors"
          >
            Run Calibration
          </button>
        )}
        {onManualMap && (
          <button
            type="button"
            onClick={onManualMap}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-md transition-colors"
          >
            Map Manually
          </button>
        )}
      </div>
    </div>
  )
}
