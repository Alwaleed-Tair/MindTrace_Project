# عقد الواجهة (API Contract)

هذا هو الاتفاق بين أجزاء المنصة. **الـ `session.json` هو المدخل.** الواجهة (عمر) تقرأ من `GET` فقط.

الأساس: `http://<host>:8000`. كل المسارات تحت `/api`. لو الخادم عنده `MINDTRACE_API_KEY` لازم الهيدر `X-API-Key: <المفتاح>` على كل شي ما عدا `/api/health`.

## المدخل: `POST /api/sessions`  (من الجسر `bridge/`)

طريقتين:

1. **JSON فقط:** `Content-Type: application/json` والجسم هو `session.json` كامل.
2. **JSON مع الصوت (الأساسية):** `multipart/form-data`:
   - الحقل `session` = ملف `session.json`
   - الحقل `files` (يتكرر) = ملفات WAV. **اسم الملف هو مساره داخل مجلد الجلسة**: `notes/title.wav` و`notes/note_01.wav` و`full_session.wav`. أي اسم غير هذي يُرفض.

الرد `201`:
```json
{"session_id": "2026-10-01_16-09-29", "updated_existing": false, "notes": 40,
 "audio_files": ["full_session.wav", "notes/note_01.wav"], "ai_status": "queued"}
```
- إرسال نفس `session_id` مرة ثانية **يحدّث** الجلسة (مثلاً بعد `--retranscribe`)، ويعيد حساب مراجعة الـ AI. الصوت القديم يبقى لو ما أُرسل جديد.
- الأخطاء: `401` مفتاح غلط، `413` أكبر من الحد (`MINDTRACE_MAX_UPLOAD_MB`)، `422` مدخل غلط (يذكر اسم الحقل).

### شكل `session.json` (schema_version = 1)
**المنصة لا تحذف أي حقل ما تعرفه**: برنامج اللابتوب يضيف حقول بس، ما يغيّر القديم. الحقول المطلوبة: `schema_version` و`session_id` و`status` و`started_at` و`duration_sec` و`note_count` و`notes`.

```jsonc
{
  "schema_version": 1,
  "session_id": "2026-10-01_16-09-29",        // حروف وأرقام و _ - . فقط
  "status": "complete",                       // recording | processing | complete
  "stop_reason": "button",
  "title": "اسم التجربة (أول كلام قاله الباحث)",
  "started_at": "2026-10-01T16:09:29+03:00", "ended_at": "...", "duration_sec": 425.54, "note_count": 39,
  "notes": [{
    "id": 0, "kind": "title",                 // أول نوت = title، والباقي note مرقّمة 1..N
    "start_sec": 4.12, "end_sec": 6.94, "duration_sec": 2.82, "time_label": "00:04",
    "audio_file": "notes/title.wav",          // أو notes/note_01.wav
    "text": "...", "word_count": 6,
    "transcript_status": "done",              // done | empty | failed | skipped | unavailable | disabled
    "speaker_check": {                        // فحص "قد لا يكون صوت الباحث" (تلميح، مو دليل)
      "status": "reference|match|uncertain|mismatch|unavailable", "similarity": 0.72,
      "possible_other_voice": false, "quality_warning": false, "mic_level": 0.04
    },
    "asr": {                                  // ثقة التحويل لنص (null لو المحرك ما يوفرها)
      "language": "Arabic|English", "confidence": 0.63,   // 0..1
      "needs_review": true,                   // الثقة منخفضة: راجع النوت بالصوت
      "language_rechecked": false,
      "alternative": {"engine": "faster-whisper", "model": "turbo", "text": "قراءة ثانية للنوت المشكوك فيه"}   // أو null
    }
  }],
  "audio": {"sample_rate": 16000, "full_recording": "full_session.wav", "dropped_frames": 0},
  "transcription": {"engine": "audar-asr", "model": "audarai/Audar-ASR-V1-Flash", "language": "ar"},
  "device": {"firmware": "2.0.0", "session_tag": "fd35"},
  "speaker_verification": {"enabled": true, "possible_other_voice_notes": []},
  "experiment_status": {"state": "completed|ongoing|paused_will_resume|unknown", "source": "user|skipped|timeout|not_asked", "answered_at": null}
}
```
**مهم للواجهة:** `needs_review` و`speaker_check.possible_other_voice` **تلميحات**. نص غلط ممكن يطلع بثقة عالية. الصوت الأصلي هو المرجع، فوفّر مشغّل صوت بجنب كل نوت.

## القراءة (للواجهة)

| الطلب | الرد |
|---|---|
| `GET /api/health` | `{ok, version, schema_version, ai_configured, auth_required}` |
| `GET /api/sessions?limit=50&offset=0` | `{total, limit, offset, items:[ملخص]}` الأحدث أولاً |
| `GET /api/sessions/{id}` | التفاصيل (تحت) |
| `GET /api/sessions/{id}/audio/{path}` | ملف WAV. مثال: `/api/sessions/ID/audio/notes/note_03.wav` |
| `POST /api/sessions/{id}/analyze` | يعيد تشغيل مراجعة الـ AI. `202`. و`503` لو ما في مفتاح DeepSeek |

**الملخص (عنصر القائمة):**
```json
{"session_id": "...", "title": "...", "started_at": "...", "duration_sec": 425.5, "note_count": 39, "status": "complete",
 "experiment_state": "completed", "needs_review_notes": 5, "possible_other_voice_notes": 0,
 "received_at": "2026-10-01T13:17:02+00:00", "ai_status": "done"}
```

**التفاصيل:** الملخص + 
```json
{"updated_at": "...", "session": { /* session.json كما وصل، بدون أي تغيير */ },
 "audio_files": ["full_session.wav", "notes/note_01.wav"],
 "ai": {"status": "done", "result": { /* تحت */ }, "error": null, "updated_at": "..."}}
```

## مراجعة الـ AI (DeepSeek)
`ai.status`: `disabled` (ما في مفتاح) · `pending` · `queued` · `running` · `done` · `failed` (مع `ai.error`).

`ai.result` لما `done`:
```json
{"summary": "ملخص 3-6 جمل",
 "documentation_quality": {"score": 0, "strengths": ["..."], "gaps": ["شي ناقص محدد"]},
 "novelty": {"score": 0, "rationale": "...", "caveat": "تقدير من النموذج بدون بحث في الأدبيات"},
 "note_suggestions": [{"note_id": 3, "suggested_text": "قسنا الـ temperature بعد الظهر", "reason": "...", "confidence": "low|medium|high"}],
 "notes_to_review": [4, 9],
 "meta": {"model": "deepseek-chat", "provider": "deepseek", "generated_at": "..."}}
```
- `note_suggestions` **اقتراحات فقط**: النص الأصلي ما يتغيّر أبداً. الواجهة تعرض الاقتراح والباحث يقبله أو يرفضه.
- `novelty.score` تقدير النموذج من معرفته، **مو فحص أدبيات**، فاعرضه بحذر.
- النموذج يستلم **نص النوتس فقط** (بدون صوت وبدون مسارات ملفات). النص يُعامل كبيانات، مو تعليمات.

## تجربة الواجهة بدون الخادم الحقيقي
`python backend/mock_backend.py` يشغّل خادم وهمي على `localhost:8000` بنفس المسارات والأشكال، ببيانات من `bridge/samples/`.
