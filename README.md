# MindTrace Project (المنصة)

الباحث يتكلم قدام الجهاز، برنامج اللابتوب يحوّل الكلام نوتس مكتوبة، **والمنصة تستقبل الـ `session.json` (مع الصوت) كمدخل** وتحوّله تجربة بنوتس، مع حسابات وتعاون وإشعارات ومراجعة من DeepSeek.

```
الجهاز ESP32 → برنامج اللابتوب (مستودع MindTrace) → bridge → backend (FastAPI + SQLite) ⇄ frontend (React)
```

| المجلد | وش فيه |
|---|---|
| `frontend/` | الواجهة (React + Vite + Tailwind)، مقسّمة لمكونات، متصلة بالـ API |
| `backend/` | الخادم: حسابات، تجارب، نوتس، فرق، إشعارات، DeepSeek، استقبال `session.json` |
| `bridge/` | يرفع مجلد جلسات اللابتوب للمنصة |
| `e2e/` | اختبارات متصفح حقيقي (Playwright) على الخادم الحقيقي |
| `docs/` | `REQUIREMENTS.md` (متطلبات النظام) و`API_CONTRACT.md` (كل الـ endpoints) و`architecture.md` |

## المتطلبات
Git، **Python 3.11+**، **Node.js 20+** (من nodejs.org، يشمل npm). لا يحتاج PostgreSQL: القاعدة SQLite وتنشأ لحالها.

## التشغيل من الصفر (Windows PowerShell)
```powershell
git clone https://github.com/Alwaleed-Tair/MindTrace_Project
cd MindTrace_Project

# 1) الخادم
cd backend
pip install -r requirements.txt
copy ..\.env.example .env                # افتح الملف وحط DEEPSEEK_API_KEY (اختياري)

# 2) الواجهة (مرة وحدة، تبني frontend/dist)
cd ..\frontend
npm install
npm run build

# 3) شغّل
cd ..\backend
python -m uvicorn main:app --port 8000
```
افتح **http://localhost:8000** وأنشئ حسابك (الاسم والبريد وكلمة مرور من 8 أحرف). كل البيانات تبدأ فاضية: أنشئ تجربة، أو ارفع جلسة من الجهاز عبر الجسر.

> لو ظهر لك `uvicorn is not recognized` (يصير مع بايثون من Microsoft Store لأن مجلد Scripts مو في PATH) استخدم `python -m uvicorn` كما فوق، فهو يشتغل دائماً.

**وضع التطوير** (تعديل الواجهة مباشرة): نافذة `python -m uvicorn main:app --port 8000 --reload` ونافذة `cd frontend; npm run dev` ثم **http://localhost:3000** (يمرّر `/api` للخادم).

## DeepSeek
المفتاح في `backend/.env` فقط (الملف في `.gitignore`)، ويُستدعى من الخادم، **ما يوصل المتصفح**:
```
DEEPSEEK_API_KEY=مفتاحك
```
بدونه كل شي يشتغل والرؤى تكتب "AI insights are off". الاستخدام: تجربة ← تبويب **Insights** ← **Refresh insights**. الجلسات المسجّلة تُحلَّل تلقائياً أول ما توصل. النموذج يستلم نص النوتس فقط.

## الأصالة (بحث في الأبحاث العلمية)
بعد تحليل الملاحظات، DeepSeek يكتب 2–4 عبارات بحث إنجليزية قصيرة (مصطلحات علمية عامة فقط، **بدون** نص النوتس ولا أسماء)، ويبحث الخادم عنها في المصادر العلمية: OpenAlex وSemantic Scholar وarXiv وCrossref (قوقل سكولار ما له API رسمي ويحجب الأدوات، فما نستخدمه). بعدها يقدّر DeepSeek نسبة الأصالة بناءً على الأبحاث اللي لقيناها، وتظهر **أقرب الأبحاث** (حد أقصى 5) بروابطها. لو مصدر ما رد يتخطاه الخادم ويكمل بالباقي، ولو ما رد أي مصدر يبقى تقدير النموذج مع تنبيه. مفاتيح OpenAlex وSemantic Scholar المجانية اختيارية (`.env.example`). التقدير تقدير، مو حكم نهائي.

نسبة الأصالة: كلما ارتفعت كان أفضل (100 = ما وُجد شيء مشابه). تبديل لغة الواجهة **لا يستدعي الذكاء الاصطناعي**: يظهر التحليل بلغته الأصلية مع زر **Translate** (طلب قصير واحد، وتُحفظ الترجمة وبعدها التبديل مجاني). زر Refresh insights يكتب التحليل من جديد بلغة الواجهة الحالية.

حذف التجربة (زر سلة المهملات في البطاقة أو صفحة التجربة، للمالك فقط) يحذف معها النوتس والتسجيل وملفات الصوت.

## ربط برنامج اللابتوب (الجسر)
الجسر برنامج منفصل على اللابتوب، ومحتاج "مفتاح" يعرّفه إن الجلسات حقتك أنت. المفتاح اسمه **token**: ثابت لحسابك، ما يتغير من نفسه، ويظل شغّال لين تحذفه أو تمسح قاعدة البيانات.

**مرة وحدة بس** (يسأل عن بريدك وكلمة مرورك في المنصة، ويحفظ المفتاح في `bridge/.bridge_token`، وكلمة المرور ما تُحفظ):
```powershell
cd bridge
pip install -r requirements.txt
python mindtrace_bridge.py --setup
```
وبعدها كل مرة:
```powershell
python mindtrace_bridge.py --watch --sessions-dir ..\..\MindTrace\MindTrace2\sessions
```
مع `--watch` يظل شغّال ويرفع كل جلسة تنتهي. بدون `--watch` يرفع الجديد ويطلع. بدائل: نسخ token من **Settings** في المنصة وضبط `$env:MINDTRACE_API_TOKEN`، أو `python backend/manage.py create-token you@lab.com`.

كل جلسة مكتملة تصير **تجربة** بنوتسها وصوتها وقراءة Whisper الثانية. وإذا العنوان المنطوق يطابق تجربة عندك تكمل عليها. تُرفع مرة وحدة، وتتحدّث نفس التجربة لو تغيّر `session.json` (بعد `--retranscribe`).

## الحساب واستعادة كلمة المرور

من **الإعدادات** يقدر المستخدم يعدّل اسمه ومختبره، ويغيّر كلمة المرور (تُسجَّل خروج المتصفحات الأخرى)، ويحذف حسابه.
"نسيت كلمة المرور؟" في صفحة الدخول ترسل رابط استعادة صالح ساعة ولمرة واحدة. لإرسال الرابط بالبريد عبّئ إعدادات `MINDTRACE_SMTP_*` و `MINDTRACE_PUBLIC_URL` في `.env` (انظر `.env.example`).
بدون بريد، الرابط ينكتب في سجل الخادم (الطرفية)، أو اطبع رابطاً لأي مستخدم بـ: `python backend/manage.py reset-link you@lab.com`.

## الاختبارات
```powershell
cd backend; python -m pytest -q                                   # الخادم + الجسر
cd frontend; npm test                                              # مكونات الواجهة
pip install -r e2e/requirements.txt; python -m playwright install chromium
python -m pytest -q e2e                                            # متصفح حقيقي (يحتاج npm run build أول)
# مع DeepSeek الحقيقي:  $env:DEEPSEEK_API_KEY="..."; python -m pytest -q e2e
```

## Docker (غير مجرَّب)
`docker compose up --build` ← **http://localhost:8000**. ما اختُبر هنا لأن البيئة بدون Docker.

## ملاحظات
- الصوت الأصلي دايماً محفوظ، و`needs_review` وقراءة Whisper الثانية **تلميحات** مو دليل.
- زر **Record a note / سجّل ملاحظة** في صفحة التجربة يملي الكلام داخل خانة الملاحظة بخاصية التعرّف على الصوت في المتصفح (Chrome أو Edge؛ المتصفح يرسل الصوت لخدمته). تقدر تعدّل النص قبل الحفظ. التسجيل الأساسي بالجودة العالية من الجهاز.
- التفاصيل: `docs/API_CONTRACT.md` و`docs/architecture.md`.
