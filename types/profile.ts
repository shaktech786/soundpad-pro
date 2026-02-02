import { OBSAction } from '../contexts/OBSContext'
import { LiveSplitAction } from '../contexts/LiveSplitContext'

export interface ButtonPosition {
  id: number
  x: number
  y: number
}

export type ButtonShape = 'circle' | 'square'

export type CombinedAction =
  | (OBSAction & { service: 'obs' })
  | (LiveSplitAction & { service: 'livesplit' })

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
}

export interface LayoutPreset {
  name: string
  description: string
  layout: ButtonPosition[]
}
