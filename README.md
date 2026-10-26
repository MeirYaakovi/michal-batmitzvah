הזמנה לבת מצווה של מיכל — אתר נחיתה סטטי + אישורי הגעה ל-Google Sheet

## מבנה

- `docs/` — האתר (GitHub Pages). הפרטים נמצאים ב-`docs/config.json`.
- `apps-script/Code.gs` — שרת האישורים (Google Apps Script) שכותב ל-Google Sheet.
- `legacy/` — גרסת Node קודמת עם לוח ניהול מקומי (לא בשימוש באתר החי).

## חיבור טופס האישורים (חד-פעמי, ~2 דקות)

1. צרו Google Sheet חדש → Extensions → Apps Script.
2. הדביקו את תוכן `apps-script/Code.gs`, שמרו, והריצו את הפונקציה `setup` (אשרו הרשאות).
3. Deploy → New deployment → סוג Web app → Execute as: **Me** · Who has access: **Anyone** → Deploy.
4. העתיקו את כתובת ה-Web app לשדה `rsvpEndpoint` ב-`docs/config.json` ועשו commit + push.

כל אישור נוסף מופיע בגיליון `אישורים`, הסיכומים בגיליון `סיכום`, ונשלח גם מייל התראה.

## התאמות

- תמונה של מיכל: שמרו `docs/photo.jpg` (ריבוע עדיף).
- שעה, כתובת וטלפון ליצירת קשר: `docs/config.json`.
