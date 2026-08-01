# SETUP.md — كل ما تحتاج تثبيته وتحميله

> هذا الملف لك أنت (وليس لـ Claude Code). ثبّت القسم الأول قبل أول جلسة.

---

## 1) أساسيات لا يمكن البدء بدونها

| البرنامج | لماذا | من أين |
|---|---|---|
| **Node.js 20 LTS** | تشغيل السيرفر وأدوات البناء | nodejs.org — حمّل نسخة LTS ويندوز |
| **Git** | التحكم بالإصدارات | git-scm.com |
| **VS Code** | المحرر | code.visualstudio.com |
| **Claude Code** | كتابة اللعبة | `npm install -g @anthropic-ai/claude-code` |
| **متصفح Chrome** | الأدق في تصحيح WebGL | google.com/chrome |

تحقق من التثبيت:
```bash
node -v      # يجب أن يظهر v20 أو أعلى
npm -v
git --version
```

إعداد Git لأول مرة:
```bash
git config --global user.name "اسمك"
git config --global user.email "بريدك"
```

---

## 2) إنشاء المستودع

على GitHub: **New repository** → الاسم مثلاً `cedar-ops` → Public → بدون README.

ثم على الـ RDP:
```bash
mkdir cedar-ops && cd cedar-ops
git init
git remote add origin https://github.com/<username>/cedar-ops.git
```

ضع ملفَّي `CLAUDE.md` و `SETUP.md` داخل المجلد، ثم:
```bash
claude
```
وابدأ بجملة واحدة: **"اقرأ CLAUDE.md وابدأ Phase 0"**.

> ملاحظة: المصادقة على GitHub من الطرفية تحتاج **Personal Access Token** وليس كلمة المرور (أنت تعرف هذه الخطوة من قبل).

---

## 3) حسابات مجانية تحتاجها

| الحساب | متى | الرابط |
|---|---|---|
| **Adobe / Mixamo** | Phase 2 — الأنميشن | mixamo.com |
| **Cloudflare** | Phase 9 — النفق و SSL | dash.cloudflare.com |

كلاهما مجاني بالكامل ولا يحتاج بطاقة.

---

## 4) الأصول (تحمّلها عند الحاجة، لا الآن)

| المصدر | المحتوى | الرخصة |
|---|---|---|
| **kenney.nl/assets** | حزم Blocky Characters / Weapon Pack / Nature Kit / Audio | CC0 |
| **quaternius.com** | شخصيات ومجموعات مباني low-poly | CC0 |
| **poly.pizza** | محرك بحث لكل ما سبق | متنوع |
| **polyhaven.com** | سماء HDRI | CC0 |
| **freesound.org** | أصوات إطلاق نار وخطوات | تحقق من الرخصة |

عند تحميل أي حزمة: اختر صيغة **glTF/.glb** إن توفرت. إن كانت `.fbx` فقط، حوّلها بـ Blender.

---

## 5) أدوات اختيارية (حسب المرحلة)

| الأداة | متى تحتاجها | الرابط |
|---|---|---|
| **Blender 4.x** | تعديل مجسّم، دمج شخصية مع أنميشن، تصدير .glb | blender.org |
| **gltf-transform** | ضغط المجسّمات (يقلّص 60-80%) | `npm i -g @gltf-transform/cli` |
| **Squoosh** | ضغط الصور إلى WebP | squoosh.app (في المتصفح) |
| **Audacity** | قصّ الأصوات وتخفيف حجمها | audacityteam.org |
| **Spector.js** | إضافة Chrome لتحليل draw calls | متجر إضافات Chrome |

مثال ضغط مجسّم:
```bash
gltf-transform optimize input.glb output.glb --compress draco
```

---

## 6) أدوات السيرفر (Phase 9 فقط)

```bash
npm install -g pm2
```
`pm2` يبقي سيرفر اللعبة يعمل بعد إغلاق جلسة الـ RDP، ويعيد تشغيله تلقائياً عند التعطّل.

**Cloudflare Tunnel** — يعطيك رابط HTTPS من دون IP ثابت ومن دون فتح بورتات في الراوتر (WebRTC يرفض العمل بدون HTTPS):
- حمّل `cloudflared` من: github.com/cloudflare/cloudflared/releases (ملف `cloudflared-windows-amd64.exe`)
- Claude Code سيعطيك أوامر الربط في وقتها

---

## 7) الاختبار

- **محلياً**: افتح نافذتي Chrome — واحدة عادية وواحدة Incognito — وادخل نفس كود الغرفة.
- **على الهاتف**: `npm run dev -- --host` ثم افتح `http://<ip-الجهاز>:5173` من هاتفك على نفس الواي فاي.
- **مع الأصدقاء**: بعد Phase 9 فقط.
- **قياس الأداء**: F3 داخل اللعبة، و Chrome DevTools → Performance.

---

## 8) نصائح عملية

- بعد كل مرحلة ناجحة: `git tag phase-N` — تعطيك نقطة رجوع آمنة.
- لا تحمّل أي حزمة أصول قبل أن يطلبها Claude Code — ستملأ المستودع بلا فائدة.
- إن قال Claude Code "أضفت مكتبة جديدة"، اسأله عن حجمها قبل الموافقة.
- اختبر على الهاتف مبكراً وباستمرار، لا في النهاية.
