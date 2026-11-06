import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { Select } from '../jobs/Select'
import { chooseAgent, useAgentChoice } from '../latex/history/agent/agentChoice'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'

/** The agent for a paper's Write message, Ask and Check my list; its model and effort are picked in the paper. */
export function PaperAgent() {
  const toast = useToast()
  const choice = useAgentChoice()
  return (
    <Section title="Papers" note="It writes commit messages, answers questions about changes and checks your notes. It runs on your compute node.">
      <Row label={<span className="whitespace-nowrap">Agent for papers</span>}>
        {choice ? <Select label="Agent for papers" value={choice.agent}
          options={choice.agents.map((a): [string, string] => [a.id, a.name])}
          onChange={(agent) => { chooseAgent({ agent }).catch((e: Error) => toast(`Could not save: ${e.message}`)) }} />
          : <Spinner size={16} />}
      </Row>
    </Section>
  )
}
