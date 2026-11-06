import { describe, expect, it } from 'vitest'

import { detect, detectIndent } from './languages'

describe('detect', () => {
  it.each([
    ['/home/jdoe/train.py', '', 'python'],
    ['/x/main.cu', '', 'cuda'],
    ['/x/CMakeLists.txt', '', 'cmake'],
    ['/x/Makefile', '', 'makefile'],
    ['/x/paper.tex', '', 'latex'],
    ['/x/run.sh', 'echo hi', 'shell'],
    ['/x/run.sh', '#!/bin/bash\n#SBATCH --time=1:00:00\n', 'slurm'],
    ['/x/job', '#!/usr/bin/env python3\n', 'python'],
    ['/x/job', '#!/bin/zsh\n', 'shell'],
    ['/x/notes', 'just words', 'plain'],
  ])('%s is %s', (path, text, id) => expect(detect(path, text).id).toBe(id))

  it('names the language', () => expect(detect('/x/a.slurm').name).toBe('Slurm script'))
  it('opens notebooks read-only', () => expect(detect('/x/a.ipynb').readOnlyReason).toBeTruthy())
})

describe('detectIndent', () => {
  it('finds tabs', () => expect(detectIndent('a\n\tb\n\tc\n', 'c')).toEqual({ tabs: true, size: 4 }))
  it('finds the common step of spaces', () =>
    expect(detectIndent('def f():\n  x = 1\n  if x:\n    y = 2\n', 'python')).toEqual({ tabs: false, size: 2 }))
  it("falls back to the language's usual size", () =>
    expect(detectIndent('x = 1\n', 'python')).toEqual({ tabs: false, size: 4 }))
  it('always uses tabs in a Makefile', () => expect(detectIndent('a:\n  b\n', 'makefile')).toEqual({ tabs: true, size: 8 }))
})
