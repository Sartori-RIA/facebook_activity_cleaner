#!/usr/bin/env node
import { CommanderError } from 'commander';
import { AppError } from '../domain/errors.js';
import { createProgram } from './program.js';

const program = createProgram();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exit(error.exitCode);
  }
  if (error instanceof AppError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.exitCode);
  }
  const message = error instanceof Error ? error.message : 'Unexpected failure.';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
