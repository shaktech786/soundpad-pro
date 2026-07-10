import React from 'react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DiscordProvider, useDiscord, DiscordAction } from '../contexts/DiscordContext'

// The context maps DiscordAction → the discord voice-settings IPC. These tests
// exercise the same mapping the pages/index.tsx dispatch loop relies on
// (mute → {mute:true}, toggle_* reads current state first, push-to-talk
// unmutes on press / remutes on release).

type Api = {
  discordStatus: ReturnType<typeof vi.fn>
  onDiscordStatusChanged: ReturnType<typeof vi.fn>
  onDiscordVoiceStateChanged: ReturnType<typeof vi.fn>
  discordGetConfig: ReturnType<typeof vi.fn>
  discordConnect: ReturnType<typeof vi.fn>
  discordSetVoiceSettings: ReturnType<typeof vi.fn>
  discordGetVoiceSettings: ReturnType<typeof vi.fn>
}

// Capture the voice-state push callback so tests can drive it like the main
// process would when Discord reports a manual mute/deafen change.
let voiceStatePush: ((state: { muted: boolean; deafened: boolean } | null) => void) | null = null

function setupApi(overrides: Partial<Api> = {}): Api {
  voiceStatePush = null
  const api: Api = {
    discordStatus: vi.fn().mockResolvedValue({ status: 'connected', error: null, user: null }),
    onDiscordStatusChanged: vi.fn().mockReturnValue(() => {}),
    onDiscordVoiceStateChanged: vi.fn((cb: (state: any) => void) => {
      voiceStatePush = cb
      return () => {
        voiceStatePush = null
      }
    }),
    discordGetConfig: vi.fn().mockResolvedValue({ hasAuth: false }),
    discordConnect: vi.fn().mockResolvedValue({ status: 'connected', error: null, user: null }),
    discordSetVoiceSettings: vi.fn().mockResolvedValue({}),
    discordGetVoiceSettings: vi.fn().mockResolvedValue({ mute: false, deaf: false }),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

async function renderConnected(api: Api) {
  const view = renderHook(() => useDiscord(), { wrapper: DiscordProvider })
  await waitFor(() => expect(view.result.current.connected).toBe(true))
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  delete (window as any).electronAPI
})

describe('DiscordContext executeAction mapping', () => {
  test('mute → setVoiceSettings({ mute: true })', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'mute' })
    })
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ mute: true })
  })

  test('unmute → setVoiceSettings({ mute: false })', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'unmute' })
    })
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ mute: false })
  })

  test('deafen → setVoiceSettings({ deaf: true })', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'deafen' })
    })
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ deaf: true })
  })

  test('undeafen → setVoiceSettings({ deaf: false })', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'undeafen' })
    })
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ deaf: false })
  })

  test('toggle_mute reads current state then inverts it', async () => {
    const api = setupApi({ discordGetVoiceSettings: vi.fn().mockResolvedValue({ mute: false }) })
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'toggle_mute' })
    })
    expect(api.discordGetVoiceSettings).toHaveBeenCalled()
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ mute: true })
  })

  test('toggle_deafen inverts the current deafen state', async () => {
    const api = setupApi({ discordGetVoiceSettings: vi.fn().mockResolvedValue({ deaf: true }) })
    const { result } = await renderConnected(api)
    await act(async () => {
      await result.current.executeAction({ type: 'toggle_deafen' })
    })
    expect(api.discordSetVoiceSettings).toHaveBeenCalledWith({ deaf: false })
  })

  test('does not call IPC when Discord is not connected', async () => {
    const api = setupApi({
      discordStatus: vi.fn().mockResolvedValue({ status: 'disconnected', error: null, user: null }),
    })
    const { result } = renderHook(() => useDiscord(), { wrapper: DiscordProvider })
    await waitFor(() => expect(result.current.connected).toBe(false))
    await act(async () => {
      await result.current.executeAction({ type: 'mute' })
    })
    expect(api.discordSetVoiceSettings).not.toHaveBeenCalled()
  })
})

describe('DiscordContext voice-state sync', () => {
  test('seeds voiceState from getVoiceSettings once connected', async () => {
    const api = setupApi({ discordGetVoiceSettings: vi.fn().mockResolvedValue({ mute: true, deaf: false }) })
    const { result } = await renderConnected(api)
    await waitFor(() => expect(result.current.voiceState).toEqual({ muted: true, deafened: false }))
  })

  test('updates voiceState from a pushed VOICE_SETTINGS_UPDATE', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)
    await waitFor(() => expect(result.current.voiceState).toEqual({ muted: false, deafened: false }))

    act(() => {
      voiceStatePush?.({ muted: true, deafened: true })
    })
    expect(result.current.voiceState).toEqual({ muted: true, deafened: true })
  })

  test('clears voiceState when the connection drops', async () => {
    const api = setupApi({ discordGetVoiceSettings: vi.fn().mockResolvedValue({ mute: true, deaf: true }) })
    const { result } = await renderConnected(api)
    await waitFor(() => expect(result.current.voiceState).toEqual({ muted: true, deafened: true }))

    // Simulate a pushed disconnect status.
    const statusCb = api.onDiscordStatusChanged.mock.calls[0][0] as (s: any) => void
    act(() => {
      statusCb({ status: 'disconnected', error: null, user: null })
    })
    expect(result.current.connected).toBe(false)
    expect(result.current.voiceState).toBeNull()
  })
})

describe('DiscordContext push-to-talk', () => {
  test('unmutes on press and remutes on release', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)

    await act(async () => {
      await result.current.setPushToTalk(true)
    })
    expect(api.discordSetVoiceSettings).toHaveBeenLastCalledWith({ mute: false })

    await act(async () => {
      await result.current.setPushToTalk(false)
    })
    expect(api.discordSetVoiceSettings).toHaveBeenLastCalledWith({ mute: true })
  })

  test('push_to_talk action click-to-test does a momentary unmute then remute', async () => {
    const api = setupApi()
    const { result } = await renderConnected(api)

    await act(async () => {
      await result.current.executeAction({ type: 'push_to_talk' } as DiscordAction)
    })

    expect(api.discordSetVoiceSettings).toHaveBeenNthCalledWith(1, { mute: false })
    expect(api.discordSetVoiceSettings).toHaveBeenNthCalledWith(2, { mute: true })
  })
})
