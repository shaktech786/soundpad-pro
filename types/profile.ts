import { OBSAction } from '../contexts/OBSContext'
import { LiveSplitAction } from '../contexts/LiveSplitContext'
import { DiscordAction } from '../contexts/DiscordContext'

export interface ButtonPosition {
  id: number
  x: number
  y: number
}

export type ButtonShape = 'circle' | 'square'

export type CombinedAction =
  | (OBSAction & { service: 'obs' })
  | (LiveSplitAction & { service: 'livesplit' })
  | (DiscordAction & { service: 'discord' })

export interface BoardProfile {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  boardLayout: ButtonPosition[]
  buttonShape: ButtonShape
  buttonMapping: [number, number][]
  soundMappings: [number, string][]
  combinedActions: [number, CombinedAction][]
  buttonVolumes: [number, number][]
  linkedButtons: [number, number][]
  stopButton: number | null
  drumPadButtons: number[]
}

export type BoardTemplateCategory = 'leverless' | 'arcade' | 'gamepad' | 'grid'

/** A physical device identity, matched against node-hid's vendorId/productId. */
export interface SupportedDeviceId {
  vid: number
  pid: number
}

/**
 * Which physical devices a template's `defaultButtonMapping` is trustworthy
 * for. `'generic'` means the mapping doesn't depend on device identity (not
 * used today — every current default mapping is device-specific). A list
 * means the mapping is only applied when one of these VID/PID pairs is the
 * currently connected device.
 */
export type SupportedDevices = SupportedDeviceId[] | 'generic'

export interface BoardTemplate {
  id: string
  name: string
  description: string
  layout: ButtonPosition[]
  buttonShape: ButtonShape
  category: BoardTemplateCategory
  /**
   * visual-pad-id -> physical-button-id, in the same [number, number][] shape
   * as BoardProfile.buttonMapping. Optional: most templates don't have a
   * trustworthy default (see config/constants.ts for which do and why).
   */
  defaultButtonMapping?: [number, number][]
  /** Required whenever defaultButtonMapping is set — see SupportedDevices. */
  supportedDevices?: SupportedDevices
}

/** @deprecated use BoardTemplate — kept as an alias so old imports keep compiling. */
export type LayoutPreset = BoardTemplate
