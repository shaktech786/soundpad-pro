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
})
