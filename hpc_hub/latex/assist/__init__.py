"""The paper's agent: Write message, Ask and Check my list. It never commits and never checks a note off: the
app shows what it says and you decide."""

from .ask import ask_prompt, parse_answer
from .choice import DEFAULT, Choice, check, describe, label, switch
from .diff_text import diff_text, numbered
from .message import SUBJECTS, message_prompt, parse_message
from .notes_check import check_prompt, parse_check
from .reply import answer
from .run import RUN_ROOT, TIMEOUT, agent_line, cancel_line, check_id, prepare_script, run_dir, run_script, start_line

__all__ = ["DEFAULT", "RUN_ROOT", "SUBJECTS", "TIMEOUT", "Choice", "agent_line", "answer", "ask_prompt",
           "cancel_line", "check", "check_id", "check_prompt", "describe", "diff_text", "label", "message_prompt",
           "numbered", "parse_answer", "parse_check", "parse_message", "prepare_script", "run_dir", "run_script",
           "start_line", "switch"]
