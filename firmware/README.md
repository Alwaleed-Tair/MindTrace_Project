# firmware

The ESP32-S3 device firmware (`MindTrace_Device.ino`) and the laptop app live in the **MindTrace** repository
(`MindTrace2/firmware`, `MindTrace2/pc`). This platform does not copy them: the laptop app writes a `session.json`
per recording and `bridge/` uploads it here.
