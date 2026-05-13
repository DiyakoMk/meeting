# 🚀 راهنمای Release نسخه جدید

این فایل مراحل کامل انتشار نسخه جدید Electron app را توضیح می‌دهد.

## 📋 پیش‌نیازها

- [ ] تمام تغییرات commit شده باشند
- [ ] تست‌های local انجام شده باشد
- [ ] Version number در `package.json` آپدیت شده باشد

## 🔢 مراحل Release

### 1️⃣ آپدیت Version

در `package.json`:
```json
{
  "version": "1.0.1"
}
```

### 2️⃣ Commit تغییرات

```bash
git add package.json
git commit -m "Bump version to 1.0.1"
git push origin orblood2-fixed
```

### 3️⃣ ایجاد Tag

```bash
git tag v1.0.1
git push origin v1.0.1
```

**نکته مهم:** حتماً `v` را قبل از شماره نسخه بگذارید (مثلاً `v1.0.1` نه `1.0.1`)

### 4️⃣ منتظر GitHub Actions بمانید

1. برو به: https://github.com/DiyakoMk/meeting/actions
2. Workflow "Build and Release Electron App" را باز کن
3. منتظر بمان تا build تمام شود (حدود 5-10 دقیقه)

### 5️⃣ چک کردن Release

1. برو به: https://github.com/DiyakoMk/meeting/releases
2. Release جدید با نام `ORBLOOD Desktop v1.0.1` باید ساخته شده باشد
3. فایل `ORBLOOD-Setup-1.0.1.exe` باید در assets موجود باشد

### 6️⃣ تست Auto-Update

1. نسخه قبلی را نصب کن
2. اپلیکیشن را باز کن
3. روی دکمه دانلود (پایین سمت چپ) کلیک کن
4. باید پیام آپدیت جدید را نشان دهد

## 🔧 ساخت Local (اختیاری)

اگر می‌خواهید قبل از release، local تست کنید:

```bash
# نصب dependencies
npm install

# ساخت برای Windows
npm run build:win

# فایل خروجی در dist-electron/ ذخیره می‌شود
```

## 📝 Changelog Template

برای هر release، یک changelog بنویسید:

```markdown
## v1.0.1 - 2026-05-13

### ✨ ویژگی‌های جدید
- اضافه شدن دکمه refresh
- سیستم auto-update

### 🐛 رفع باگ‌ها
- رفع مشکل voice calling
- بهبود عملکرد

### 🔧 بهبودها
- بهینه‌سازی TURN URLs برای ایران
- Lucide icons به صورت local
```

## ⚠️ نکات مهم

### Version Numbering
- **Major** (1.x.x): تغییرات بزرگ و breaking changes
- **Minor** (x.1.x): ویژگی‌های جدید
- **Patch** (x.x.1): رفع باگ‌ها

### Tag Format
- ✅ صحیح: `v1.0.1`, `v2.0.0`, `v1.5.3`
- ❌ غلط: `1.0.1`, `version-1.0.1`, `release-1.0.1`

### GitHub Actions
- Workflow فقط با tag های `v*` trigger می‌شود
- اگر build fail شد، tag را پاک کنید و دوباره بسازید:
  ```bash
  git tag -d v1.0.1
  git push origin :refs/tags/v1.0.1
  ```

## 🔄 Rollback (برگشت به نسخه قبل)

اگر مشکلی پیش آمد:

1. Release جدید را Draft کنید
2. Tag را پاک کنید:
   ```bash
   git tag -d v1.0.1
   git push origin :refs/tags/v1.0.1
   ```
3. Version را در `package.json` برگردانید
4. Commit و push کنید

## 📊 چک‌لیست قبل از Release

- [ ] تمام تست‌ها pass شده‌اند
- [ ] Voice calling کار می‌کند
- [ ] Auto-update تست شده
- [ ] دکمه‌های refresh و download کار می‌کنند
- [ ] Version number صحیح است
- [ ] Changelog نوشته شده
- [ ] Tag با فرمت `v*` ساخته شده

## 🎯 مثال کامل

```bash
# 1. آپدیت version
# در package.json: "version": "1.0.1"

# 2. Commit
git add package.json
git commit -m "Release v1.0.1: Add refresh button and auto-update"

# 3. Push
git push origin orblood2-fixed

# 4. Tag
git tag v1.0.1
git push origin v1.0.1

# 5. منتظر GitHub Actions بمانید
# 6. چک کنید: https://github.com/DiyakoMk/meeting/releases
```

## 🆘 عیب‌یابی

### Build Failed
- لاگ‌های GitHub Actions را چک کنید
- مطمئن شوید `package.json` معتبر است
- Dependencies را local تست کنید

### Release ساخته نشد
- مطمئن شوید tag با `v` شروع می‌شود
- Permissions در workflow را چک کنید
- GITHUB_TOKEN باید دسترسی write داشته باشد

### Auto-update کار نمی‌کند
- مطمئن شوید Release منتشر شده (نه Draft)
- فایل `.exe` در assets موجود باشد
- Version در app با GitHub Release مطابقت داشته باشد

## 📞 پشتیبانی

اگر مشکلی پیش آمد:
1. لاگ‌های GitHub Actions را بررسی کنید
2. Issue در GitHub باز کنید
3. با تیم توسعه تماس بگیرید
