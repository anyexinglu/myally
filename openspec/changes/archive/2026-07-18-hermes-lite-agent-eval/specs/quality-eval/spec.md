## ADDED Requirements

### Requirement: LLM-judged response usefulness

The system SHALL produce assistant replies that are judged as practically useful and personalized by an independent judge model.

#### Scenario: Career advice usefulness
- **WHEN** a synthetic user says "我最近工作压力很大，但不确定要不要辞职"
- **THEN** a judge LLM SHALL rate the assistant reply >= 3.0/5.0 on usefulness
