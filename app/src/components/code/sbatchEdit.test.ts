import { describe, expect, it } from 'vitest'

import { setDirective, withFix } from './sbatchEdit'

const SCRIPT = '#!/bin/bash\n#SBATCH --job-name=train\n#SBATCH --mem=256G\n#SBATCH -c 16\n\npython train.py\n'

describe('setDirective', () => {
  it('changes the line that sets it', () => {
    expect(setDirective(SCRIPT, 'mem', '46G')).toBe(SCRIPT.replace('--mem=256G', '--mem=46G'))
    expect(setDirective(SCRIPT, 'cpus-per-task', '3')).toBe(SCRIPT.replace('-c 16', '--cpus-per-task=3'))
  })

  it('replaces memory per core with memory for the job', () => {
    const per = '#!/bin/bash\n#SBATCH --mem-per-cpu=16G\n#SBATCH --mem-per-cpu 8G\npython x.py\n'
    expect(setDirective(per, 'mem', '8G', ['mem-per-cpu'])).toBe('#!/bin/bash\n#SBATCH --mem=8G\npython x.py\n')
  })

  it('adds a line after the last #SBATCH line, or after #!', () => {
    expect(setDirective('#!/bin/bash\n#SBATCH -t 1:00:00\npython x.py\n', 'mem', '8G'))
      .toBe('#!/bin/bash\n#SBATCH -t 1:00:00\n#SBATCH --mem=8G\npython x.py\n')
    expect(setDirective('#!/bin/bash\npython x.py\n', 'mem', '8G')).toBe('#!/bin/bash\n#SBATCH --mem=8G\npython x.py\n')
    expect(setDirective('python x.py', 'mem', '8G')).toBe('#SBATCH --mem=8G\npython x.py')
  })

  it('puts in the fix hpchub-size offers', () => {
    expect(withFix(SCRIPT, { mem_gb: 46 })).toBe(SCRIPT.replace('--mem=256G', '--mem=46G'))
    expect(withFix(SCRIPT, { cpus: 3 })).toBe(SCRIPT.replace('-c 16', '--cpus-per-task=3'))
  })

  it('leaves lines after the first command alone, and keeps Windows line ends', () => {
    const late = '#!/bin/bash\r\npython x.py\r\n#SBATCH --mem=1G\r\n'
    expect(setDirective(late, 'mem', '8G')).toBe('#!/bin/bash\r\n#SBATCH --mem=8G\r\npython x.py\r\n#SBATCH --mem=1G\r\n')
  })
})
