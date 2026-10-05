# MindTrace UML

Diagrams drawn from the actual code (device firmware, laptop listener, bridge, platform backend/frontend).
`MindTrace_UML.pdf` has every diagram with an Arabic explanation.

| File | Diagram |
|---|---|
| 01_use_cases | Use cases |
| 02_deployment | Deployment / components |
| 03_database_erd | Database (exact SQLite schema) |
| 04_backend_classes | Backend packages (routers -> services -> core) |
| 05_listener_classes | Laptop listener classes |
| 06_seq_recording_to_platform | Sequence: device button -> platform |
| 07_seq_live_status | Sequence: live device status card |
| 08_seq_note_mention | Sequence: note with @mention |
| 09_states | States: device screen, device link, segmenter |
| 10_states_platform | States: experiment status, AI status |

Re-render after a change: `java -jar plantuml.jar -tpng -tsvg -charset UTF-8 docs/uml/*.puml`
