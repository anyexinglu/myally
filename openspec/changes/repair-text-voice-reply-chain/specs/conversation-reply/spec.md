## ADDED Requirements

### Requirement: Text messages receive an LLM reply

The production conversation function SHALL default to the CloudBase model enabled for the current growth-plan environment and SHALL remain loadable on the deployed Node.js runtime.

#### Scenario: Default text turn

- **WHEN** the user sends non-empty text without an explicit model override
- **THEN** the conversation function uses `hy3`, persists the turn, and returns an assistant message

### Requirement: Voice messages reuse the conversation pipeline

The mini program SHALL transcribe a completed short recording and SHALL submit the recognized text through the same conversation send path as typed text.

#### Scenario: Recognized voice turn

- **WHEN** the user records speech, releases the voice control, and recognition returns non-empty text
- **THEN** the mini program sends that text through `send()` and displays the assistant reply

#### Scenario: Voice recognition fails

- **WHEN** recognition errors, times out, or returns empty text
- **THEN** the mini program shows a retryable message and does not display the recording as successfully sent
