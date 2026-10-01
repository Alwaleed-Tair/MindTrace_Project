# MindTrace Project (المنصة)

الباحث يتكلم قدام الجهاز، برنامج اللابتوب يحوّل الكلام نوتس مكتوبة، **والمنصة تستقبل الـ `session.json` (مع الصوت) كمدخل** وتحوّله تجربة بنوتس، مع حسابات وتعاون وإشعارات ومراجعة من DeepSeek.

```
الجهاز ESP32 → برنامج اللابتوب (مستودع MindTrace) → bridge → backend (FastAPI + SQLite) ⇄ frontend (React)
```

| المجلد | وش فيه |
|---|---|
| `frontend/` | الواجهة (React + Vite + Tailwind)، مقسّمة لمكونات، متصلة بالـ API |
| `backend/` | الخادم: حسابات، تجارب، نوتس، تعاون، إشعارات، DeepSeek، استقبال `session.json`، seed |
| `bridge/` | يرفع مجلد جلسات اللابتوب للمنصة |
| `e2e/` | اختبارات متصفح حقيقي (Playwright) على الخادم الحقيقي |
| `docs/` | `API_CONTRACT.md` (كل الـ endpoints) و`architecture.md` |

## المتطلبات
Git، **Python 3.11+**، **Node.js 20+** (من nodejs.org، يشمل npm). لا يحتاج PostgreSQL: القاعدة SQLite وتنشأ لحالها.

## التشغيل من الصفر (Windows PowerShell)
```powershell
git clone https://github.com/Alwaleed-Tair/MindTrace_Project
cd MindTrace_Project
git checkout claude/platform-link        # لين ندمج الفرع في main

# 1) الخادم
cd backend
pip install -r requirements.txt
copy ..\.env.example .env                # افتح الملف وحط DEEPSEEK_API_KEY (اختياري)
python seed.py                           # بيانات تجريبية من ملفات JSON

# 2) الواجهة (مرة وحدة، تبني frontend/dist)
cd ..\frontend
npm install
npm run build

# 3) شغّل
cd ..\backend
python -m uvicorn main:app --port 8000
```
افتح **http://localhost:8000** ← اضغط **Open demo workspace**، أو سجّل بـ `demo@mindtrace.app` وكلمة المرور `MindTrace-Demo-2026` (للتجربة المحلية فقط)، أو أنشئ حسابك.

> لو ظهر لك `uvicorn is not recognized` (يصير مع بايثون من Microsoft Store لأن مجلد Scripts مو في PATH) استخدم `python -m uvicorn` كما فوق، فهو يشتغل دائماً.

**وضع التطوير** (تعديل الواجهة مباشرة): نافذة `python -m uvicorn main:app --port 8000 --reload` ونافذة `cd frontend; npm run dev` ثم **http://localhost:3000** (يمرّر `/api` للخادم).

## DeepSeek
المفتاح في `backend/.env` فقط (الملف في `.gitignore`)، ويُستدعى من الخادم، **ما يوصل المتصفح**:
```
DEEPSEEK_API_KEY=مفتاحك
```
بدونه كل شي يشتغل والرؤى تكتب "AI insights are off". الاستخدام: تجربة ← تبويب **Insights** ← **Refresh insights**. الجلسات المسجّلة تُحلَّل تلقائياً أول ما توصل. النموذج يستلم نص النوتس فقط.

## ربط برنامج اللابتوب
1. من الواجهة: **Settings ← Laptop bridge token ← Create a token** وانسخه (يظهر مرة وحدة).
2. على اللابتوب:
```powershell
cd bridge
pip install -r requirements.txt
$env:MINDTRACE_API_TOKEN = "mt_..."
python mindtrace_bridge.py --sessions-dir ..\..\MindTrace\MindTrace2\sessions
python mindtrace_bridge.py --watch --sessions-dir ...    # يظل شغال ويرفع كل جلسة تنتهي
```
كل جلسة مكتملة تصير **تجربة جديدة** بنوتسها (مع الصوت وقراءة Whisper الثانية للنوتس المشكوك فيها). تُرفع مرة وحدة، وبعدين لو تغيّر `session.json` (بعد `--retranscribe`) تتحدّث نفس التجربة. تقدر تنشئ token بدون واجهة: `python backend/manage.py create-token you@lab.com`.

## الاختبارات
```powershell
cd backend; python -m pytest -q                                   # الخادم + الجسر
cd frontend; npm test                                              # مكونات الواجهة
pip install -r e2e/requirements.txt; python -m playwright install chromium
python -m pytest -q e2e                                            # متصفح حقيقي (يحتاج npm run build أول)
# مع DeepSeek الحقيقي:  $env:DEEPSEEK_API_KEY="..."; python -m pytest -q e2e
```

## Docker (غير مجرَّب)
`docker compose up --build` ثم `docker compose run --rm app python seed.py` ← **http://localhost:8000**. ما اختُبر هنا لأن البيئة بدون Docker.

## ملاحظات
- الصوت الأصلي دايماً محفوظ، و`needs_review` وقراءة Whisper الثانية **تلميحات** مو دليل.
- زر **Record observation** في صفحة التجربة عرض تجريبي من تصميم الواجهة الأصلي (ما يسجّل). التسجيل الحقيقي من الجهاز.
- التفاصيل: `docs/API_CONTRACT.md` و`docs/architecture.md`.
