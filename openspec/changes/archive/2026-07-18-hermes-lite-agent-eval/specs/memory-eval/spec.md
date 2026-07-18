## ADDED Requirements

### Requirement: Basic memory persistence

The system SHALL ensure that an explicit user statement from an earlier turn is retrieved and influences the assistant reply in a subsequent turn within the same conversation.

#### Scenario: Low-risk preference is remembered across turns
- **WHEN** a synthetic user explicitly states "我偏好低风险的投资方案"
- **THEN** the memory observer creates a confirmed Profile Item with type=preference, memoryStatus=completed
- **AND WHEN** the same user asks "给我推荐一个方案" in the same conversation
- **THEN** the assistant reply SHALL reference the low-risk preference and the turn SHALL report usedMemories.length >= 1

#### Scenario: Memory persists through a third turn
- **WHEN** a synthetic user has established a low-risk preference and completed two conversation turns
- **AND THEN** asks "还有什么需要注意的" in the same conversation
- **THEN** the assistant reply SHALL still reference the low-risk preference

### Requirement: Personal goal memory

The system SHALL persist user-declared goals and use them in subsequent planning responses.

#### Scenario: Weight loss goal is recalled
- **WHEN** a synthetic user states "我想在半年内把体重减到60公斤，我现在每天跑步半小时"
- **THEN** memoryStatus=completed
- **AND WHEN** the same user asks "帮我规划一下下周的饮食和运动"
- **THEN** the reply SHALL reference weight loss, running, or dietary planning
