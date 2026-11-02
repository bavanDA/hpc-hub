# The owner's design rules

Every screen and every line of text is checked against this list before the owner sees it. Each rule comes from
the owner's own review notes; the quote is what they said. A rule that can be tested in code has a test.

## Words

1. **Sound like a person, not a program.** No sentences that read like if/else branches ("If you don't have one,
   HPC Hub can make one"). Each state shows only the one sentence that is true now.
   > "too robotic and ai generated and it is like if and else, it is like a code"
2. **Don't explain the app's insides.** No "From the cluster's docs", "On the gpu queue", "Set by the cluster's
   admins", "HPC Hub signs in with your password because". Say what the user gets or must do.
3. **The cluster's full name once per screen** (the title). After that "Wulver", "Yale", or nothing.
   > "why you keep repeating yale bouchet"
4. **Verbs the owner chose:** "Send it to Yale" (not give), "Release node" (not end), "Settings" (not
   Preferences), "Sign in".
   > "send it to yale is better than give it to yale" · "end node is bad, release node"
5. **No em or en dashes, no exclamation marks, no marketing words.**
6. **Jargon gets plain words:** queue (not partition), "3 days" (not 3-00:00:00), "Waiting: higher-priority jobs go
   first" (not Priority).

## What is on screen

7. **Nothing redundant.** No subtitle that repeats the title or adds nothing (hostnames under cluster names,
   "NJIT · VPN and Duo"); no fact shown twice on one screen (a node in the strip and again on the card).
   > "the subtitle is redundant, like what is the point of NJIT · VPN and Duo??"
8. **No pointless choices.** No "Skip"/"Skip for now" where the defaults already work; a choice the cluster's
   admins make (Duo vs code) is never the user's.
   > "what is the point of skip" · "this is not sth user can choose, it is based on cluster"
9. **No vague buttons.** A dialog's buttons say what they do: "Keep running" / "Cancel job", "Keep it" / "Release
   node". Never a bare "Cancel" next to a destructive action. The destructive button looks enabled (solid red).
   > "very bad" (the cancel-job dialog)
10. **Few tabs, few boxes.** Settings has two tabs and an Advanced section, not five tabs.
    > "so many tabs and very bad design"
11. **Ask every time and other once-set options live in the node screen or settings, never on the card.**
    > "ask everytime is in very bad place for android"
12. **Real things over generic icons:** the AI products' own logos for Claude, ChatGPT, Gemini, Cursor.
    > "use the ai model icons not agent icon"
13. **Real cluster choices:** GPU types and slices (A100 10/20/40 GB) from the cluster, not a bare count.
    > "user want 10 gb, part of gpu"
14. **A user who already has the thing:** detect it (an existing SSH key, a running node) and skip ahead.
    > "the user might already have key"

## Phone

15. **Made for thumbs:** 48 dp targets, the Material 3 navigation bar, no rows of tiny icon buttons, nothing cut off
    at 360 dp wide.
    > "the buttons are not mobile friendly, even the navbar on the bottom is very bad"

16. **Any number.** Wherever a number is chosen (cores, memory, GPUs, time), the user can type any value the
    cluster allows. Presets and steppers are shortcuts, never the only way.
    > "the design should be in way that user can select any number"
17. **Professional and relevant.** Neutral colors (greys, white, black); the accent only for the main button and
    the current choice. No decorative colors, gradients, colored icons or playful styles. Show only what helps the
    task.
    > "keep it professional and relevant, no colorful"

18. **Style E everywhere (phone first, then desktop).** The owner chose style E, "Black and white rows" in the
    manner of GitHub and Linear mobile: monochrome rows on a plain background, hairline separators, label on the
    left and value on the right, tapping a number row opens it in place as a large input with its limit, a chevron
    only where a row opens another screen, segmented quick picks, one solid main button (white on dark, black on
    light), no colored accent. Reference: `docs/design/style-e/` (E.html and screenshots).
    > "I like the E style can you create the whole using that style"

## Process

19. **Show before merging.** Every design goes to the owner on a review page first; nothing merges without it.
20. **A fix is only done when it shows on screen.** Check every reported fix against the actual screenshot.
21. **Check the whole app, not just the screen that was commented on.** A rule broken once is checked everywhere.
