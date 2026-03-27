import { createConsola } from "consola"

export const logger = createConsola({})

export const verbose = (msg: string) => logger.verbose(msg)
