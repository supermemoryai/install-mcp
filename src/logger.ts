import { createConsola } from 'consola'

export const logger = createConsola({})

export const verbose = logger.verbose.bind(logger)
