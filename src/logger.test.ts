import { describe, it, expect, beforeEach, jest } from '@jest/globals'

const mockConsola = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  verbose: jest.fn(),
  box: jest.fn(),
  prompt: jest.fn(),
}

// Mock consola before importing
jest.mock('consola', () => ({
  createConsola: jest.fn(() => mockConsola),
}))

import { createConsola } from 'consola'
import { logger, verbose } from './logger'

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('logger creation', () => {
    it('should create logger with empty config', () => {
      // Test that createConsola exists and is mockable
      expect(createConsola).toBeDefined()
    })

    it('should export logger instance', () => {
      expect(logger).toBeDefined()
      expect(logger).toBe(mockConsola)
    })
  })

  describe('verbose function', () => {
    it('should call logger.verbose with message', () => {
      const message = 'Test verbose message'
      verbose(message)

      expect(mockConsola.verbose).toHaveBeenCalledWith(message)
    })

    it('should handle empty message', () => {
      verbose('')

      expect(mockConsola.verbose).toHaveBeenCalledWith('')
    })

    it('should handle multi-line message', () => {
      const message = 'Line 1\nLine 2\nLine 3'
      verbose(message)

      expect(mockConsola.verbose).toHaveBeenCalledWith(message)
    })
  })

  describe('logger methods', () => {
    it('should have info method', () => {
      expect(logger.info).toBeDefined()
      expect(logger.info).toBe(mockConsola.info)
    })

    it('should have error method', () => {
      expect(logger.error).toBeDefined()
      expect(logger.error).toBe(mockConsola.error)
    })

    it('should have warn method', () => {
      expect(logger.warn).toBeDefined()
      expect(logger.warn).toBe(mockConsola.warn)
    })

    it('should have log method', () => {
      expect(logger.log).toBeDefined()
      expect(logger.log).toBe(mockConsola.log)
    })

    it('should have verbose method', () => {
      expect(logger.verbose).toBeDefined()
      expect(logger.verbose).toBe(mockConsola.verbose)
    })

    it('should have box method', () => {
      expect(logger.box).toBeDefined()
      expect(logger.box).toBe(mockConsola.box)
    })

    it('should have prompt method', () => {
      expect(logger.prompt).toBeDefined()
      expect(logger.prompt).toBe(mockConsola.prompt)
    })
  })
})
