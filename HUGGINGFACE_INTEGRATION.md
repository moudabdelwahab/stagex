# تكامل Hugging Face - دليل التنفيذ

## نظرة عامة

تم استبدال تكامل Gemini القديم بتكامل جديد مع **Hugging Face Inference API** باستخدام نموذج **google/gemma-2b-it**. هذا التكامل يوفر:

- ✅ **دعم اللهجة المصرية**: يتم فرض استخدام اللهجة المصرية من خلال System Prompt
- ✅ **ربط ببيانات Supabase**: البوت يمكنه الوصول إلى قاعدة المعرفة والإجابة على أسئلة المشروع
- ✅ **حفظ الردود تلقائياً**: جميع ردود البوت يتم حفظها في قاعدة البيانات
- ✅ **إدارة مركزية**: يمكن تغيير System Prompt من لوحة الإدارة

## المتطلبات

### 1. Hugging Face API Token
- انتقل إلى https://huggingface.co/settings/tokens
- أنشئ token جديد مع صلاحيات `read` (على الأقل)
- انسخ الـ token

### 2. تحديث قاعدة البيانات

قم بتشغيل الأوامر التالية في Supabase SQL Editor:

```sql
-- تحديث جدول api_keys لإضافة حقل Hugging Face
ALTER TABLE api_keys 
ADD COLUMN IF NOT EXISTS huggingface_key TEXT;

-- تحديث جدول chat_messages لإضافة حقل is_bot_reply (اختياري للإحصائيات)
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS is_bot_reply BOOLEAN DEFAULT FALSE;
```

### 3. إضافة System Prompt الافتراضي

```sql
-- تعيين System Prompt افتراضي
INSERT INTO bot_settings (system_prompt, smart_memory_enabled)
VALUES (
  'أنت مساعد ذكي لمنصة مدعوم. يجب أن تتحدث باللهجة المصرية فقط. كن ودياً وسريع الاستجابة. استخدم المعلومات المتاحة عن المشروع للإجابة على الأسئلة.',
  true
)
ON CONFLICT (id) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt;
```

## البنية المعمارية

### 1. دالة Supabase Edge Function

**المسار**: `/supabase/functions/huggingface-chatbot/index.ts`

**الوظائف**:
- استقبال رسالة المستخدم
- جلب System Prompt من `bot_settings`
- جلب معلومات المشروع من `knowledge_base`
- استدعاء Hugging Face API
- حفظ الرد في `chat_messages`

**المعاملات**:
```json
{
  "message": "السؤال من المستخدم",
  "sessionId": "معرف الجلسة (اختياري)"
}
```

**الرد**:
```json
{
  "reply": "رد البوت بالكامل"
}
```

### 2. تحديثات chat-logic.js

عند إرسال المستخدم رسالة:
1. يتم حفظ الرسالة في `chat_messages`
2. يتم استدعاء دالة `huggingface-chatbot` تلقائياً
3. يتم حفظ الرد تلقائياً في `chat_messages` مع `is_admin_reply: true`

### 3. لوحة الإدارة

**المسار**: `/admin/settings.html`

**الإعدادات المتاحة**:
- **Hugging Face API Token**: حفظ التوكن بأمان
- **System Prompt**: تعديل التعليمات الأساسية للبوت
- **Smart Memory**: تفعيل/تعطيل ذاكرة المحادثات

## كيفية الاستخدام

### للمسؤول

1. انتقل إلى **لوحة الإدارة** → **إعدادات** → **مفاتيح API والربط الخارجي**
2. أدخل **Hugging Face API Token**
3. انتقل إلى **إعدادات البوت الذكي**
4. عدّل **System Prompt** (تأكد من إضافة "يجب أن تتحدث باللهجة المصرية")
5. اضغط **حفظ**

### للعميل

1. انتقل إلى صفحة **المحادثة** (`/chat-customer.html`)
2. اكتب رسالتك
3. اضغط **إرسال**
4. سيظهر رد البوت تلقائياً

## ملاحظات مهمة

### 1. اللهجة المصرية
لفرض استخدام اللهجة المصرية، تأكد من أن System Prompt يحتوي على:
```
يجب أن تتحدث باللهجة المصرية فقط
```

### 2. قاعدة المعرفة
البوت يسحب آخر 5 مقالات من `knowledge_base` لاستخدامها كـ context. تأكد من:
- إضافة مقالات مفيدة في قاعدة المعرفة
- تحديث المقالات بانتظام
- استخدام عناوين واضحة

### 3. الأداء
- وقت الاستجابة يعتمد على سرعة Hugging Face API
- في حالة التأخير، يمكن زيادة `max_new_tokens` أو تقليله

### 4. التكاليف
- Hugging Face توفر **Inference API مجاني** مع حد معين
- للاستخدام الكثيف، قد تحتاج إلى خطة مدفوعة

## استكشاف الأخطاء

### البوت لا يرد
1. تحقق من وجود **Hugging Face API Token** في الإعدادات
2. تحقق من صحة الـ Token (جرب على https://huggingface.co/models)
3. تحقق من سجلات Supabase Edge Functions

### الردود ليست بالمصرية
1. تحقق من System Prompt
2. أضف "يجب أن تتحدث باللهجة المصرية" بوضوح
3. جرب إرسال رسالة اختبار جديدة

### خطأ في قاعدة البيانات
1. تحقق من وجود جدول `knowledge_base`
2. تحقق من وجود جدول `bot_settings`
3. قم بتشغيل أوامر SQL المذكورة أعلاه

## الملفات المعدلة

- ✅ `/supabase/functions/huggingface-chatbot/index.ts` - دالة جديدة
- ✅ `/assets/js/chat-logic.js` - استدعاء البوت تلقائياً
- ✅ `/assets/js/admin/settings.js` - تحديث حفظ الإعدادات
- ✅ `/admin/settings.html` - تحديث واجهة الإعدادات
- ✅ `/supabase/functions/gemini-proxy/` - محذوف

## الملفات المحذوفة

- ❌ `/supabase/functions/gemini-proxy/` - استبدل بـ Hugging Face
- ❌ `/setup_gemini_storage.sql` - لم تعد مطلوبة

## المراجع

- [Hugging Face Inference API](https://huggingface.co/docs/api-inference)
- [Google Gemma Model](https://huggingface.co/google/gemma-2b-it)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
