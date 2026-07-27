import { describe, test, expect } from 'vitest'
import { BOARD_TEMPLATES } from '../config/constants'
import { CANVAS_WIDTH, CANVAS_HEIGHT, BUTTON_SIZE, MAX_BUTTONS } from '../components/BoardBuilder'
import type { BoardTemplateCategory } from '../types/profile'

describe('BOARD_TEMPLATES catalog', () => {
  test('ships at least 6 templates', () => {
    expect(BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(6)
  })

  test('covers the leverless, arcade, gamepad and grid categories', () => {
    const categories = new Set(BOARD_TEMPLATES.map(t => t.category))
    const required: BoardTemplateCategory[] = ['leverless', 'arcade', 'gamepad', 'grid']
    for (const category of required) {
      expect(categories.has(category)).toBe(true)
    }
  })

  test('every template has a unique id', () => {
    const ids = BOARD_TEMPLATES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test.each(BOARD_TEMPLATES.map(t => [t.id, t] as const))(
    '%s: buttons fit inside the canvas',
    (_id, template) => {
      for (const btn of template.layout) {
        expect(btn.x).toBeGreaterThanOrEqual(0)
        expect(btn.y).toBeGreaterThanOrEqual(0)
        expect(btn.x + BUTTON_SIZE).toBeLessThanOrEqual(CANVAS_WIDTH)
        expect(btn.y + BUTTON_SIZE).toBeLessThanOrEqual(CANVAS_HEIGHT)
      }
    }
  )

  test.each(BOARD_TEMPLATES.map(t => [t.id, t] as const))(
    '%s: does not exceed MAX_BUTTONS',
    (_id, template) => {
      expect(template.layout.length).toBeLessThanOrEqual(MAX_BUTTONS)
    }
  )

  test.each(BOARD_TEMPLATES.map(t => [t.id, t] as const))(
    '%s: has unique button ids within the layout',
    (_id, template) => {
      const ids = template.layout.map(b => b.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  )

  test('every template declares a valid buttonShape', () => {
    for (const template of BOARD_TEMPLATES) {
      expect(['circle', 'square']).toContain(template.buttonShape)
    }
  })

  test('the Haute42 template ships a non-empty default mapping scoped to the Haute42 device', () => {
    const haute42 = BOARD_TEMPLATES.find(t => t.id === 'haute42-16')!
    expect(haute42.defaultButtonMapping).toBeDefined()
    expect(haute42.defaultButtonMapping!.length).toBeGreaterThan(0)
    expect(haute42.supportedDevices).toEqual([{ vid: 0x0f0d, pid: 0x0092 }])
  })

  test('every defaultButtonMapping only references visual ids present in that template\'s layout', () => {
    for (const template of BOARD_TEMPLATES) {
      if (!template.defaultButtonMapping) continue
      const layoutIds = new Set(template.layout.map(b => b.id))
      for (const [visualId] of template.defaultButtonMapping) {
        expect(layoutIds.has(visualId)).toBe(true)
      }
    }
  })

  test('a template with defaultButtonMapping also declares supportedDevices', () => {
    for (const template of BOARD_TEMPLATES) {
      if (template.defaultButtonMapping && template.defaultButtonMapping.length > 0) {
        expect(template.supportedDevices).toBeDefined()
      }
    }
  })

  test('templates other than the Haute42 do not ship a default mapping', () => {
    for (const template of BOARD_TEMPLATES) {
      if (template.id === 'haute42-16') continue
      expect(template.defaultButtonMapping ?? []).toHaveLength(0)
    }
  })
})
