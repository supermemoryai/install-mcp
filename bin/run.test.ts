/* eslint-disable @typescript-eslint/no-var-requires */
import { describe, it, expect, jest } from '@jest/globals'

// Mock dependencies before importing
jest.mock('yargs', () => jest.fn())
jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('../src/commands/install', () => ({
  builder: jest.fn(),
  handler: jest.fn(),
}))

describe('CLI entry point', () => {
  it('should import required modules', () => {
    const yargs = require('yargs')
    const dotenv = require('dotenv')
    const installCommand = require('../src/commands/install')

    expect(yargs).toBeDefined()
    expect(dotenv).toBeDefined()
    expect(installCommand).toBeDefined()
  })

  it('should have dotenv config function', () => {
    const { config } = require('dotenv')
    expect(config).toBeDefined()
    expect(typeof config).toBe('function')
  })

  it('should have install command exports', () => {
    const { builder, handler } = require('../src/commands/install')
    expect(builder).toBeDefined()
    expect(handler).toBeDefined()
    expect(typeof builder).toBe('function')
    expect(typeof handler).toBe('function')
  })

  it('should be able to use yargs function', () => {
    const yargs = require('yargs')
    expect(typeof yargs).toBe('function')
  })
})
