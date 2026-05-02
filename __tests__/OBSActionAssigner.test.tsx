import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OBSActionAssigner } from '../components/OBSActionAssigner'

vi.mock('obs-websocket-js', () => ({ default: class OBSWebSocket {} }))

const baseProps = {
  buttonIndex: 3,
  currentAction: null,
  currentSound: null,
  scenes: [],
  sources: [],
  onAssign: vi.fn(),
  onClose: vi.fn(),
  obsConnected: true,
  liveSplitConnected: true,
}

describe('OBSActionAssigner', () => {
  test('renders Sound tab by default when no current sound or action', () => {
    render(<OBSActionAssigner {...baseProps} />)
    expect(screen.getByText(/Choose Local Audio File/i)).toBeInTheDocument()
  })

  test('shows error banner when soundError prop is set', () => {
    render(
      <OBSActionAssigner
        {...baseProps}
        currentSound="C:\\sounds\\missing.mp3"
        soundError="ENOENT: no such file or directory"
      />
    )
    expect(screen.getByText('Sound file unavailable')).toBeInTheDocument()
    expect(screen.getByText(/File not found/i)).toBeInTheDocument()
  })

  test('hides normal "Current Sound" display when soundError is set', () => {
    render(
      <OBSActionAssigner
        {...baseProps}
        currentSound="C:\\sounds\\missing.mp3"
        soundError="ENOENT: no such file"
      />
    )
    // "Current Sound:" label should not appear because error banner replaces it
    expect(screen.queryByText('Current Sound:')).not.toBeInTheDocument()
  })

  test('shows "Current Sound" display when sound is assigned and no error', () => {
    render(
      <OBSActionAssigner
        {...baseProps}
        currentSound="C:\\sounds\\good.mp3"
      />
    )
    expect(screen.getByText('Current Sound:')).toBeInTheDocument()
  })

  test('shows OBS dot indicator when currentAction is an OBS action', () => {
    render(
      <OBSActionAssigner
        {...baseProps}
        currentAction={{ type: 'toggle_streaming', service: 'obs' }}
      />
    )
    expect(screen.getByLabelText('OBS action assigned')).toBeInTheDocument()
  })

  test('shows LiveSplit dot indicator when currentAction is a LiveSplit action', () => {
    render(
      <OBSActionAssigner
        {...baseProps}
        currentAction={{ type: 'start_or_split', service: 'livesplit' }}
      />
    )
    expect(screen.getByLabelText('LiveSplit action assigned')).toBeInTheDocument()
  })

  test('shows no dot indicators when no action is assigned', () => {
    render(<OBSActionAssigner {...baseProps} />)
    expect(screen.queryByLabelText('OBS action assigned')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('LiveSplit action assigned')).not.toBeInTheDocument()
  })

  test('shows OBS disconnected state', () => {
    render(<OBSActionAssigner {...baseProps} obsConnected={false} />)
    expect(screen.getByText(/OBS.*Disconnected/i)).toBeInTheDocument()
  })
})
