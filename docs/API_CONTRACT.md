# عقد الواجهة (API Contract) · v2

الأساس: `http://<host>:8000`، كل المسارات تحت `/api`. الواجهة والـ API يقدّمهم نفس الخادم، فالـ cookie يشتغل بدون إعدادات.
الأخطاء كلها بهذا الشكل: `{"detail": "رسالة واضحة"}` مع كود HTTP مناسب (401 غير مسجّل، 403 ممنوع، 404 غير موجود أو ليس لك، 409 مكرر، 422 مدخل غلط، 429 محاولات كثيرة، 503 الخدمة غير مفعّلة).

## المصادقة
- **الواجهة (متصفح):** cookie اسمه `mt_session` (HttpOnly، SameSite=Lax). كل طلب كتابة (`POST/PATCH/DELETE`) لازم يحمل الهيدر `X-Requested-With: mindtrace` (حماية CSRF).
- **الجسر (laptop bridge):** `Authorization: Bearer mt_...` (token ينشئه المستخدم من Settings). ما يحتاج الهيدر الثاني.
- كلمات المرور تُخزَّن مشفّرة (scrypt). 5 محاولات دخول خاطئة تُوقف الحساب 5 دقائق (429).
- مستخدم **لا يرى ولا يعدّل** تجارب غيره: أي تجربة ليست له ترجع `404` (نفس جواب "غير موجودة").

## جدول الـ endpoints

| Method | Endpoint | الغرض | Auth |
|---|---|---|---|
| GET | `/api/health` | حالة الخادم، هل DeepSeek مفعّل، هل الديمو متاح | لا |
| POST | `/api/auth/register` | حساب جديد `{name,email,password(≥8),lab?}` ويدخل مباشرة | لا |
| POST | `/api/auth/login` | `{email,password,remember}` | لا |
| POST | `/api/auth/demo` | فتح مساحة العرض (بعد `python seed.py`) | لا |
| POST | `/api/auth/logout` | | نعم |
| GET | `/api/auth/me` | المستخدم الحالي (فيه `id` الفريد `MT-XXXXXXXX`) | نعم |
| POST | `/api/auth/api-token` | token للجسر (يظهر مرة وحدة، يُخزَّن hash فقط) | cookie |
| GET | `/api/stats` | أرقام لوحة التحكم + ملخص الرؤى | نعم |
| GET | `/api/experiments?status=&q=&sort=` | تجاربي والمشاركة معي | نعم |
| POST | `/api/experiments` | `{title,summary?,tags?}` | نعم |
| GET | `/api/experiments/{id}` | التجربة + النوتس + المتعاونون | نعم |
| PATCH | `/api/experiments/{id}` | `{status}` (أي عضو) أو `{title,summary,tags}` (المالك) | نعم |
| DELETE | `/api/experiments/{id}` | المالك فقط. يحذف النوتس والتعاون والإشعارات والتسجيل الأصلي وملفات الصوت | نعم |
| POST | `/api/experiments/{id}/notes` | `{text,kind?}` | نعم |
| PATCH | `/api/notes/{id}` | `{text?,kind?}` الكاتب أو المالك | نعم |
| DELETE | `/api/notes/{id}` | الكاتب أو المالك | نعم |
| GET | `/api/experiments/{id}/notes/{noteId}/audio` | صوت النوت المسجّل (wav) | نعم |
| GET | `/api/users/search?q=` | مطابقة **تامة** لبريد أو ID (ما في تصفح للمستخدمين) | نعم |
| GET | `/api/collaborators/recent` | آخر من أضفتهم | نعم |
| POST | `/api/experiments/{id}/collaborators` | `{identifier}` بريد أو `MT-XXXXXXXX` | نعم |
| DELETE | `/api/experiments/{id}/collaborators/{userId}` | المالك فقط | نعم |
| GET | `/api/notifications?unread=&limit=` | `{unread_count, items}` | نعم |
| POST | `/api/notifications/read` | `{ids?}` بدون ids = الكل | نعم |
| GET | `/api/experiments/{id}/insights?language=ar\|en` | حالة ونتيجة مراجعة DeepSeek. لو اللغة المطلوبة غير لغة التحليل وفي ترجمة محفوظة تُعاد مترجمة، وإلا `needs_translation: true` | نعم |
| POST | `/api/experiments/{id}/insights/translate?language=` | ترجمة التحليل مرة وحدة (طلب قصير) وتُحفظ، وتبديل اللغة بعدها مجاني | نعم |
| POST | `/api/experiments/{id}/insights` | تشغيل المراجعة (202). `503` لو ما في مفتاح | نعم |
| **POST** | **`/api/sessions`** | **المدخل: `session.json` (+ الصوت) من برنامج اللابتوب** | token أو cookie |
| GET | `/api/sessions`, `/api/sessions/{sessionId}` | الجلسات المرفوعة والـ JSON الأصلي بدون أي تغيير | نعم |
| GET | `/api/sessions/{sessionId}/audio/{path}` | ملف صوت من جلستي | نعم |
| POST | `/api/dev/simulate-collaborator-note` | **اختبار فقط** (`MINDTRACE_DEV_TOOLS=true`): زميل وهمي يضيف نوت فيصلك إشعار حقيقي | نعم |

## المدخل: `POST /api/sessions`
طريقتين:
1. `Content-Type: application/json` والجسم هو `session.json` كامل.
2. `multipart/form-data`: الحقل `session` = ملف `session.json`، والحقل `files` (يتكرر) = ملفات WAV، **اسم الملف هو مساره داخل المجلد**: `notes/title.wav` و`notes/note_01.wav` و`full_session.wav`. أي اسم ثاني يُرفض (422).

كل تسجيل = **تجربة** (experiment)، **إلا لو العنوان المنطوق يطابق عنوان تجربة عندك** (بدون اعتبار للحروف الكبيرة والترقيم والتشكيل): وقتها التسجيل **يكمل نفس التجربة** (نوتس جديدة، المدة تتجمّع، والحالة تتحدّث من `experiment_status`). ما يصير دمج بين مستخدمين. العنوان المنطوق صار عنوان التجربة، وكل نوت صار نوت `source: "recording"` فيه `asr` (الثقة وقراءة Whisper الثانية) و`speaker_check`. إعادة رفع نفس `session_id` (بعد `--retranscribe`) **تحدّث** نفس التجربة: نوتس الـ ASR تأخذ النص الجديد، ونوت عدّله شخص يدوياً **ما يتغيّر أبداً**.

الرد `201`: `{session_id, experiment_id, updated_existing, notes, audio_files, ai_status}`.

شكل `session.json` (schema_version = 1): المطلوب `schema_version, session_id, status, started_at, duration_sec, note_count, notes[]`. **المنصة تحتفظ بأي حقل ما تعرفه** (برنامج اللابتوب يضيف حقول بس). التفاصيل في `MindTrace/MindTrace2/README.md`.

## شكل التجربة (ما تعرضه الواجهة)
```json
{"id":"12","code":"EXP-204","title":"...","summary":"...","status":"Active|Paused|Completed",
 "duration":"01:42:18","originality":82,"tags":["Catalysis"],"color":"mint",
 "created_at":"...","updated_at":"...","role":"owner|editor","owner":{"id":"MT-...","name":"...","lab":"...","initials":"NR"},
 "collaborators":[{"id":"MT-...","name":"...","initials":"LH"}],"note_count":2,"session_id":null,"ai_status":"none",
 "notes":[{"id":5,"text":"...","kind":"observation|hypothesis|decision","source":"manual|recording","text_source":"human|asr",
           "time_label":"01:12","created_at":"...","author":{},"has_audio":true,"can_edit":true,
           "asr":{"language":"Arabic","confidence":0.63,"needs_review":true,"alternative":{"engine":"faster-whisper","model":"turbo","text":"..."}}}]}
```
(`notes` تظهر في `GET /experiments/{id}` فقط.) **`needs_review` تلميح مو دليل**: نص غلط ممكن يطلع بثقة عالية، والصوت هو المرجع.

## الإشعارات
`kind`: `note_added` · `note_updated` · `collaborator_added` · `status_changed`. تُنشأ لكل أعضاء التجربة **ما عدا من قام بالفعل**. الواجهة تستعلم كل 4 ثواني.

## مراجعة DeepSeek
`ai.status`: `none` · `disabled` (ما في مفتاح) · `queued` · `running` · `done` · `failed` (مع `error`). النتيجة:
```json
{"summary":"ملخص كامل للتجربة (6-10 جمل من الوصف والنوتس)","key_points":["..."],"next_steps":["..."],"documentation_quality":{"score":45,"strengths":["..."],"gaps":["..."]},
 "novelty":{"score":30,"rationale":"...","caveat":"تقدير من النموذج بدون بحث في الأدبيات"},
 "note_suggestions":[{"note_id":3,"suggested_text":"...","reason":"...","confidence":"medium"}],
 "notes_to_review":[3],"note_kinds":[{"note_id":3,"kind":"hypothesis"}],"meta":{"model":"deepseek-chat","attempts":1}}
```
- **اقتراحات فقط**: نص أي نوت ما يتغيّر إلا لو قبل الباحث (زر "Use this text"). المتغيّر تلقائياً شيئين: تصنيف النوت المسجّل (`kind`) والرقم `originality` من تقدير النموذج.
- النموذج أحياناً يرجع JSON ناقص (شفناه فعلاً مع DeepSeek): الخادم يعيد الطلب حتى 3 مرات قبل ما يعلن الفشل.
- `novelty` تقدير من معرفة النموذج، **مو فحص أدبيات**.
- DeepSeek يستلم **نص النوتس فقط** (بدون صوت ولا مسارات). النص يُعامل كبيانات مو تعليمات. المفتاح يبقى في الخادم، ما يوصل المتصفح أبداً.
