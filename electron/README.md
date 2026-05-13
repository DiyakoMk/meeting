# ORBLOOD Desktop App

نسخه دسکتاپ ORBLOOD با Electron - تجربه native app با قابلیت auto-update

## ✨ ویژگی‌ها

- 🚀 **اتصال مستقیم**: بدون نیاز به وارد کردن URL، مستقیماً به orblood.ir وصل می‌شود
- 🔄 **دکمه Refresh**: رفرش سریع صفحه از پایین سمت چپ
- 📥 **Auto Update**: چک کردن خودکار آپدیت‌های جدید از GitHub Releases
- 🎨 **Native Feel**: حس و ظاهر یک اپلیکیشن واقعی، نه مرورگر
- 🔒 **امن**: Sandbox mode فعال برای امنیت بیشتر

## 🛠️ نصب و توسعه

### پیش‌نیازها
```bash
npm install
```

### اجرای حالت توسعه
```bash
npm start
```

### ساخت نسخه Windows
```bash
npm run build:win
```

خروجی در پوشه `dist-electron/` ذخیره می‌شود.

## 📦 انتشار نسخه جدید

### 1. آپدیت نسخه
در `package.json`:
```json
{
  "version": "1.0.1"
}
```

### 2. Commit و Tag
```bash
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin orblood2-fixed --tags
```

### 3. ساخت و آپلود
```bash
npm run build:win
```

فایل `ORBLOOD-Setup-1.0.1.exe` در `dist-electron/` ساخته می‌شود.

### 4. ایجاد GitHub Release

1. برو به: https://github.com/DiyakoMk/meeting/releases/new
2. Tag: `v1.0.1`
3. Title: `ORBLOOD Desktop v1.0.1`
4. Description: توضیحات تغییرات
5. آپلود فایل `ORBLOOD-Setup-1.0.1.exe`
6. Publish release

### 5. Auto-Update

کاربران با کلیک روی دکمه دانلود (پایین سمت چپ):
- اگر آپدیت جدید باشه، دکمه می‌زنه و فایل جدید دانلود می‌شه
- اگر آپدیتی نباشه، پیام "You are running the latest version" نمایش داده می‌شود

## 🎮 دکمه‌های اپلیکیشن

### پایین سمت چپ:
- **🔄 Refresh**: رفرش کامل صفحه
- **📥 Download**: چک کردن و دانلود آپدیت جدید

وقتی آپدیت جدید موجود باشه، دکمه دانلود با انیمیشن pulse نمایش داده می‌شود.

## 🔧 تنظیمات

### تغییر URL سایت
در `electron/main.js`:
```javascript
const APP_URL = 'https://orblood.ir';
```

### تغییر ریپوی GitHub
در `electron/main.js`:
```javascript
const GITHUB_REPO = 'DiyakoMk/meeting';
```

## 📝 نکات مهم

1. **Version**: همیشه version در `package.json` باید با tag در GitHub یکسان باشه
2. **Release**: فایل `.exe` باید در GitHub Release آپلود بشه
3. **Auto-Update**: فقط وقتی کار می‌کنه که release در GitHub منتشر شده باشه
4. **Icon**: آیکون از `public/favicon.ico` استفاده می‌شود

## 🐛 عیب‌یابی

### دکمه‌ها نمایش داده نمی‌شوند
- مطمئن شوید `preload.js` به درستی لود شده
- DevTools را باز کنید و console را چک کنید

### Auto-update کار نمی‌کند
- مطمئن شوید GitHub Release منتشر شده
- فایل `.exe` در assets موجود باشد
- اتصال اینترنت فعال باشد

### ساخت فایل نهایی خطا می‌دهد
```bash
# پاک کردن cache
rm -rf dist-electron node_modules
npm install
npm run build:win
```

## 📄 لایسنس

MIT
